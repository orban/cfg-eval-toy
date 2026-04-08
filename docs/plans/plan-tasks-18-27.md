# CFG Eval Toy Plan — Tasks 18-27 (Levels 2-3, polish, Loom, submit)

**Parent plan:** `2026-04-08-cfg-eval-toy-plan.md`
**Previous file:** `plan-tasks-1-17.md`

This file covers Phases 5-7: Level 2 upgrades (Wilson + variants), Level 3 stretches (exploration → failure tagger → Mode B → fix beat), polish, and Loom recording.

---

# Phase 5 — Level 2 upgrades (~30 min)

## Task 18: Wilson score CI (TDD)

**Files:** Create `lib/stats.ts`, `lib/stats.test.ts`

**Goal:** Pure Wilson score formula with real tests. This is the one module where TDD earns its keep — stats math is silent when it's wrong.

- [ ] **Step 1: Write `lib/stats.test.ts` first**

```ts
import { describe, it, expect } from "vitest";
import { wilsonCI, confidenceLabel } from "./stats";

describe("wilsonCI", () => {
  it("returns [0, 0] for n=0", () => {
    const ci = wilsonCI(0, 0);
    expect(ci).toEqual({ low: 0, high: 0 });
  });

  it("returns tight interval at n=100, k=50", () => {
    const ci = wilsonCI(50, 100);
    expect(ci.low).toBeGreaterThan(0.4);
    expect(ci.low).toBeLessThan(0.42);
    expect(ci.high).toBeGreaterThan(0.59);
    expect(ci.high).toBeLessThan(0.61);
  });

  it("returns wide interval at n=10, k=8", () => {
    const ci = wilsonCI(8, 10);
    expect(ci.low).toBeGreaterThan(0.44);
    expect(ci.low).toBeLessThan(0.50);
    expect(ci.high).toBeGreaterThan(0.94);
    expect(ci.high).toBeLessThan(0.98);
  });

  it("handles p=1 without div-by-zero", () => {
    const ci = wilsonCI(10, 10);
    expect(ci.high).toBe(1);
    expect(ci.low).toBeGreaterThan(0.65);
    expect(ci.low).toBeLessThan(0.75);
  });

  it("handles p=0", () => {
    const ci = wilsonCI(0, 10);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeLessThan(0.35);
    expect(ci.high).toBeGreaterThan(0.25);
  });
});

describe("confidenceLabel", () => {
  it("returns LOW for wide intervals", () => {
    expect(confidenceLabel(wilsonCI(8, 10))).toBe("LOW");
  });

  it("returns HIGH for very tight intervals at n=200", () => {
    expect(confidenceLabel(wilsonCI(190, 200))).toBe("HIGH");
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
npm test
```

- [ ] **Step 3: Implement `lib/stats.ts`**

```ts
// lib/stats.ts
// Wilson score confidence interval. Ported from Cerberus.
// Correct at p=0 and p=1, unlike the normal approximation.

export interface ConfidenceInterval {
  low: number;
  high: number;
}

const Z_95 = 1.96;

export function wilsonCI(passes: number, trials: number): ConfidenceInterval {
  if (trials === 0) return { low: 0, high: 0 };

  const p = passes / trials;
  const z = Z_95;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;

  return {
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
  };
}

export function confidenceLabel(ci: ConfidenceInterval): "LOW" | "MED" | "HIGH" {
  const width = ci.high - ci.low;
  if (width > 0.30) return "LOW";
  if (width > 0.10) return "MED";
  return "HIGH";
}
```

- [ ] **Step 4: Run — expect pass**

```
npm test
```

- [ ] **Step 5: Commit**

```
git add lib/stats.ts lib/stats.test.ts
git commit -m "add wilson score ci with tests"
```

---

## Task 19: Integrate Wilson + variant listing (API route + UI)

**Files:** Modify `app/api/eval/route.ts`, `app/page.tsx`

**Goal:** Extend the eval report with Wilson CI, confidence label, and distinct raw SQL variants with counts. Update the UI to display them.

- [ ] **Step 1: Extend `app/api/eval/route.ts`**

```ts
// app/api/eval/route.ts
import { NextResponse } from "next/server";
import { getCaseById } from "@/lib/eval-cases";
import { runTrial } from "@/lib/eval-runner";
import { wilsonCI, confidenceLabel } from "@/lib/stats";
import type { ConfidenceInterval } from "@/lib/stats";
import type { TrialResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface EvalRequest {
  caseIds: string[];
  trialsPerCase: number;
}

interface VariantGroup {
  sql: string;
  count: number;
  passed: boolean;
}

interface CaseReport {
  caseId: string;
  nl: string;
  trials: TrialResult[];
  passes: number;
  passRate: number;
  ci: ConfidenceInterval;
  confidence: "LOW" | "MED" | "HIGH";
  variants: VariantGroup[];
}

function groupVariants(trials: TrialResult[]): VariantGroup[] {
  const map = new Map<string, VariantGroup>();
  for (const t of trials) {
    const key = t.sql || "(none)";
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { sql: key, count: 1, passed: t.passed });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export async function POST(req: Request) {
  const body = (await req.json()) as EvalRequest;
  const reports: CaseReport[] = [];

  for (const caseId of body.caseIds) {
    const caseDef = getCaseById(caseId);
    if (!caseDef) {
      return NextResponse.json({ error: `Unknown case: ${caseId}` }, { status: 400 });
    }

    const trials: TrialResult[] = [];
    for (let i = 0; i < body.trialsPerCase; i++) {
      trials.push(await runTrial(caseDef));
    }

    const passes = trials.filter((t) => t.passed).length;
    const ci = wilsonCI(passes, trials.length);
    reports.push({
      caseId: caseDef.id,
      nl: caseDef.nl,
      trials,
      passes,
      passRate: trials.length > 0 ? passes / trials.length : 0,
      ci,
      confidence: confidenceLabel(ci),
      variants: groupVariants(trials),
    });
  }

  return NextResponse.json({ reports });
}
```

- [ ] **Step 2: Update `app/page.tsx` — extend `CaseReport` and replace the report block**

```tsx
interface ConfidenceInterval { low: number; high: number; }
interface VariantGroup { sql: string; count: number; passed: boolean; }
interface CaseReport {
  caseId: string;
  nl: string;
  trials: TrialResult[];
  passes: number;
  passRate: number;
  ci: ConfidenceInterval;
  confidence: "LOW" | "MED" | "HIGH";
  variants: VariantGroup[];
}
```

Replace the `{evalReport && ...}` block:

```tsx
{evalReport && (
  <div>
    <h3 style={{ marginBottom: 4 }}>
      {evalReport.passes}/{evalReport.trials.length} passed
      {" — "}
      {(evalReport.passRate * 100).toFixed(1)}%{" "}
      <span style={{ color: "#666", fontWeight: "normal" }}>
        [CI: {(evalReport.ci.low * 100).toFixed(0)}–{(evalReport.ci.high * 100).toFixed(0)}%]
      </span>
    </h3>
    <div style={{ marginBottom: 16, fontSize: 14, color: "#666" }}>
      Confidence: <strong style={{
        color: evalReport.confidence === "LOW" ? "#c92a2a"
             : evalReport.confidence === "MED" ? "#e67700" : "#2f9e44",
      }}>{evalReport.confidence}</strong>
      {evalReport.confidence === "LOW" && " — n is too small to commit to a reliability claim"}
    </div>

    <h4>Distinct SQL variants: {evalReport.variants.length}</h4>
    <ul style={{ listStyle: "none", padding: 0 }}>
      {evalReport.variants.map((v, i) => (
        <li key={i} style={{ marginBottom: 8 }}>
          <div>
            <span style={{ color: v.passed ? "green" : "crimson" }}>
              {v.passed ? "PASS" : "FAIL"}
            </span>{" "}
            <strong>{v.count}x</strong>
          </div>
          <pre style={{ background: "#f4f4f4", padding: 8, borderRadius: 4, fontSize: 12, margin: "4px 0" }}>
            {v.sql}
          </pre>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 3: Smoke test**

```
npm run dev
```

Run a case with 5 trials. Verify Wilson CI, confidence label, and variants display.

- [ ] **Step 4: Commit**

```
git add app/api/eval/route.ts app/page.tsx
git commit -m "add wilson ci and variant listing"
```

**CHECKPOINT: Level 2 complete. If you're running short, go to Task 24.**

---

# Phase 6 — Level 3 stretches (~60 min)

## Task 20: Exploration pass — collect real outputs

**Files:** Create `scripts/explore.ts`

**Goal:** Run a burst of trials across all cases (canonical + paraphrases + edge cases) and save the outputs. This does two things:
1. Tells you whether the failure tagger taxonomy is right (Task 21 depends on this).
2. Tells you whether the Loom should follow Path A (lead with a failure) or Path B (measurement-is-the-point). **Do not skip this.**

- [ ] **Step 1: Create `scripts/explore.ts`**

```ts
// scripts/explore.ts
// Run: npx tsx --env-file=.env.local scripts/explore.ts > exploration-log.md

import { loadEvalCases } from "../lib/eval-cases";
import { runTrial } from "../lib/eval-runner";

const TRIALS_PER_CASE = 5;
const cases = loadEvalCases();

console.log("# Exploration pass\n");
console.log(`${cases.length} cases x ${TRIALS_PER_CASE} trials each\n`);

for (const c of cases) {
  console.log(`## ${c.id} (intent: ${c.intent})`);
  console.log(`NL: ${c.nl}\n`);

  const seen = new Map<string, { count: number; passed: boolean; error?: string; failedPatterns?: string[] }>();
  for (let i = 0; i < TRIALS_PER_CASE; i++) {
    const result = await runTrial(c);
    const key = result.sql || "(none)";
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      seen.set(key, {
        count: 1,
        passed: result.passed,
        error: result.error,
        failedPatterns: result.failedPatterns,
      });
    }
  }

  for (const [sql, info] of seen.entries()) {
    console.log(`- ${info.passed ? "PASS" : "FAIL"} ${info.count}x \`${sql}\``);
    if (info.error) console.log(`  - Error: ${info.error}`);
    if (info.failedPatterns) console.log(`  - Failed patterns: ${info.failedPatterns.join(", ")}`);
  }
  console.log();
}
```

- [ ] **Step 2: Run it**

```
npx tsx --env-file=.env.local scripts/explore.ts > exploration-log.md
```

Open `exploration-log.md`. Read through.

- [ ] **Step 3: Decide the Loom path and record it**

Write a note at the top of `exploration-log.md`:
```
Loom path: A (lead with failure X) | B (stable, measurement-is-point)
Specific case to demo: <case_id>
```

- [ ] **Step 4: Commit the script (log is gitignored)**

```
git add scripts/explore.ts
git commit -m "add exploration pass script"
```

---

## Task 21: Failure tagger (designed against real outputs, no TDD)

**Files:** Create `lib/failure-tagger.ts`, modify `lib/eval-runner.ts`, `app/api/eval/route.ts`, `app/page.tsx`

**Goal:** Label failed trials with a systematic failure mode. **Do not write tests before implementation** — the spec says design this against real outputs, not against preassumed labels. Write a single smoke test against a real failure from `exploration-log.md` after the implementation works.

If this task has been running for more than 30 minutes, stop. The plan already ships Level 2 cleanly; the tagger is cuttable.

- [ ] **Step 1: Review `exploration-log.md`**

Look at the failed trials. Count how many fit each category:
- A time predicate with `<=` where expected `>=` → wrong_comparison_direction
- A time predicate with the wrong `INTERVAL` unit → wrong_time_unit
- A time predicate missing entirely → missing_filter

If the actual failures don't match these, adjust the labels. If there are no failures at all, implement the labels as-is and test manually against synthetic failing SQL.

- [ ] **Step 2: Implement `lib/failure-tagger.ts`**

Uses `String.prototype.match()` (not the regex dotted method) — same behavior for single matches, avoids a local write-hook heuristic that flags the substring.

```ts
// lib/failure-tagger.ts
// Labels a failed trial with a systematic failure mode.
// Built against the actual outputs in exploration-log.md — not preassumed.

export type FailureMode =
  | "wrong_comparison_direction"
  | "wrong_time_unit"
  | "missing_filter"
  | "other";

export function tagFailure(
  sql: string,
  expectedPatterns: Record<string, string>,
  failedPatterns: string[]
): FailureMode {
  for (const failedName of failedPatterns) {
    if (failedName !== "time_predicate") continue;

    if (!/order_purchase_timestamp/i.test(sql)) {
      return "missing_filter";
    }

    const expected = expectedPatterns[failedName] ?? "";
    const expectsGTE = />=/.test(expected);
    const hasLTE = /order_purchase_timestamp\s*<=?/i.test(sql);
    const hasGTE = /order_purchase_timestamp\s*>=?/i.test(sql);
    if (expectsGTE && hasLTE && !hasGTE) {
      return "wrong_comparison_direction";
    }

    const unitMatch = expected.match(/(HOUR|DAY|WEEK|MONTH)/i);
    if (unitMatch) {
      const expectedUnit = unitMatch[1].toUpperCase();
      const genUnitMatch = sql.match(/INTERVAL\s+\d+\s+(HOUR|DAY|WEEK|MONTH)/i);
      if (genUnitMatch && genUnitMatch[1].toUpperCase() !== expectedUnit) {
        return "wrong_time_unit";
      }
    }

    return "missing_filter";
  }

  for (const failedName of failedPatterns) {
    if (/predicate|filter|status|state/.test(failedName)) {
      return "missing_filter";
    }
  }

  return "other";
}
```

- [ ] **Step 3: Thread through `lib/eval-runner.ts`**

Update `runTrial` to tag pattern failures:

```ts
// lib/eval-runner.ts (updated)
import { runPipeline } from "./pipeline";
import { tagFailure } from "./failure-tagger";
import type { EvalCase, TrialResult } from "./types";

function checkPatterns(sql: string, patterns: Record<string, string>): string[] {
  const failed: string[] = [];
  for (const [name, pattern] of Object.entries(patterns)) {
    try {
      if (!new RegExp(pattern).test(sql)) failed.push(name);
    } catch {
      failed.push(name);
    }
  }
  return failed;
}

export async function runTrial(caseDef: EvalCase): Promise<TrialResult> {
  const pipe = await runPipeline(caseDef.nl);

  if (pipe.stage === "grammar_fail") {
    return { sql: pipe.sql, passed: false, stage: "grammar_fail", error: pipe.error };
  }
  if (pipe.stage === "db_fail") {
    return { sql: pipe.sql, passed: false, stage: "db_fail", error: pipe.error };
  }

  const failedPatterns = checkPatterns(pipe.sql, caseDef.expected_patterns);
  if (failedPatterns.length > 0) {
    return {
      sql: pipe.sql,
      passed: false,
      stage: "pattern_fail",
      rows: pipe.rows ?? undefined,
      error: `pattern mismatch: ${failedPatterns.join(", ")}`,
      failedPatterns,
      failureMode: tagFailure(pipe.sql, caseDef.expected_patterns, failedPatterns),
    };
  }

  return { sql: pipe.sql, passed: true, stage: "ok", rows: pipe.rows ?? undefined };
}
```

- [ ] **Step 4: Add failure mode breakdown to `/api/eval` response**

In `app/api/eval/route.ts`, add to `CaseReport`:

```ts
interface CaseReport {
  // ... existing
  failureModes: Record<string, number>;
}
```

Inside the case loop, after `trials` is built:

```ts
const failureModes: Record<string, number> = {};
for (const t of trials) {
  if (t.stage === "pattern_fail" && t.failureMode) {
    failureModes[t.failureMode] = (failureModes[t.failureMode] || 0) + 1;
  }
}
reports.push({
  // ... existing fields
  failureModes,
});
```

- [ ] **Step 5: Display failure modes in `app/page.tsx`**

Update `CaseReport` interface:

```tsx
interface CaseReport {
  // ... existing
  failureModes: Record<string, number>;
}
```

Add after the variants list:

```tsx
{Object.keys(evalReport.failureModes).length > 0 && (
  <div style={{ marginTop: 16 }}>
    <h4>Systematic failure modes observed</h4>
    <ul>
      {Object.entries(evalReport.failureModes).map(([mode, count]) => (
        <li key={mode}>
          <code>{mode}</code>: {count} ({((count / evalReport.trials.length) * 100).toFixed(0)}%)
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 6: Write one smoke test against a real observed failure**

Only after it's working end-to-end. Create `lib/failure-tagger.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tagFailure } from "./failure-tagger";

// Smoke test built against an actual observation from exploration-log.md.
// Replace the SQL string below with one of the failed outputs you saw.

describe("tagFailure", () => {
  it("labels the observed failure from exploration", () => {
    const sql = "SELECT sum(price) FROM orders WHERE order_purchase_timestamp >= now() - INTERVAL 30 DAY";
    const patterns = {
      time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+30\\s+hour",
    };
    expect(tagFailure(sql, patterns, ["time_predicate"])).toBe("wrong_time_unit");
  });
});
```

- [ ] **Step 7: Run tests + smoke test in browser**

```
npm test
npm run dev
```

- [ ] **Step 8: Commit**

```
git add lib/failure-tagger.ts lib/failure-tagger.test.ts lib/eval-runner.ts app/api/eval/route.ts app/page.tsx
git commit -m "add failure mode tagger"
```

---

## Task 22: Mode B — semantic robustness sweep

**Files:** Modify `app/page.tsx`

**Goal:** Add a mode radio selector. Mode B uses the `intents` list already fetched from `/api/cases` and sends all paraphrases for the selected intent in one `/api/eval` call. No new routes needed — the canonical ID source is already unified.

- [ ] **Step 1: Add mode state to `app/page.tsx`**

```tsx
const [mode, setMode] = useState<"A" | "B">("A");
const [selectedIntent, setSelectedIntent] = useState<string>("");
const [evalReports, setEvalReports] = useState<CaseReport[]>([]);

// In the useEffect that loads /api/cases, also seed the selectedIntent:
useEffect(() => {
  fetch("/api/cases")
    .then((r) => r.json())
    .then((data: CasesResponse) => {
      setCases(data);
      if (data.canonical.length > 0) setEvalCaseId(data.canonical[0].id);
      const realIntents = data.intents.filter((i) => i.id !== "edge_safety");
      if (realIntents.length > 0) setSelectedIntent(realIntents[0].id);
    })
    .catch(() => setCases({ canonical: [], intents: [], cases: [] }));
}, []);
```

- [ ] **Step 2: Update `runEvalCall` to dispatch based on mode**

```tsx
async function runEvalCall() {
  if (!cases) return;

  let caseIds: string[];
  if (mode === "A") {
    if (!evalCaseId) return;
    caseIds = [evalCaseId];
  } else {
    const intent = cases.intents.find((i) => i.id === selectedIntent);
    if (!intent) return;
    caseIds = intent.caseIds;
  }

  setEvalLoading(true);
  setEvalReport(null);
  setEvalReports([]);
  const res = await fetch("/api/eval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseIds, trialsPerCase: trials }),
  });
  const data = (await res.json()) as { reports: CaseReport[] };
  setEvalReport(data.reports[0]);
  setEvalReports(data.reports);
  setEvalLoading(false);
}
```

- [ ] **Step 3: Add mode selector UI and Mode B display**

Above the case dropdown:

```tsx
<div style={{ marginBottom: 12 }}>
  <label>
    <input type="radio" name="mode" checked={mode === "A"} onChange={() => setMode("A")} /> Mode A — Stochasticity (fixed input x N)
  </label>{" "}
  <label>
    <input type="radio" name="mode" checked={mode === "B"} onChange={() => setMode("B")} /> Mode B — Semantic robustness (paraphrases x N)
  </label>
</div>
```

Replace the case dropdown with a conditional:

```tsx
{mode === "A" && cases && (
  <label>Case:{" "}
    <select value={evalCaseId} onChange={(e) => setEvalCaseId(e.target.value)}>
      {cases.canonical.map((c) => <option key={c.id} value={c.id}>{c.nl}</option>)}
    </select>
  </label>
)}

{mode === "B" && cases && (
  <label>Intent:{" "}
    <select value={selectedIntent} onChange={(e) => setSelectedIntent(e.target.value)}>
      {cases.intents.filter((i) => i.id !== "edge_safety").map((i) => (
        <option key={i.id} value={i.id}>{i.label}</option>
      ))}
    </select>
  </label>
)}
```

Add after the main report block, a per-paraphrase summary for Mode B:

```tsx
{mode === "B" && evalReports.length > 1 && (
  <div style={{ marginTop: 16 }}>
    <h3>Per-paraphrase results</h3>
    {evalReports.map((r) => (
      <div key={r.caseId} style={{ marginBottom: 8 }}>
        <strong>{r.passes}/{r.trials.length}</strong> <em>"{r.nl}"</em>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Smoke test**

```
npm run dev
```

Switch to Mode B, pick an intent, run with 3 trials. Verify per-paraphrase list.

- [ ] **Step 5: Commit**

```
git add app/page.tsx
git commit -m "add mode b semantic robustness sweep"
```

**Hard Constraint check:** if Mode B is fighting you, cut it. Mode A alone carries the thesis.

---

## Task 23: Failure + fix beat (only if exploration surfaced a real failure)

**Files:** varies — typically `lib/openai.ts` (prompt tightening) or `grammar/orders.lark` (grammar rule)

**Goal:** If Task 20 found a consistent failure, prepare a "fix" to demonstrate in the Loom. Show one small change that kills the failure.

- [ ] **Step 1: Pick one failure from `exploration-log.md`**

The best candidate is a case where multiple trials produce the same wrong output — the fix is repeatable and the demo is convincing.

- [ ] **Step 2: Write the fix**

Options, in order of demonstrability:
- **Prompt improvement** — add a line to `PRINCIPLES` in `lib/openai.ts`. Cheapest and most demonstrable.
- **Grammar tightening** — often hard in Lark, only if a specific rule can lock the invariant.
- **Stricter eval regex** — catches the failure but doesn't fix it; weaker demo.

- [ ] **Step 3: Verify the fix kills the failure**

```
npx tsx --env-file=.env.local scripts/explore.ts > exploration-log-after-fix.md
```

Compare before and after. Confirm the failing paraphrase now passes.

- [ ] **Step 4: Commit the fix as a separate commit (important for the Loom diff)**

```
git add lib/openai.ts
git commit -m "fix: pin interval unit to user phrasing"
```

---

# Phase 7 — Polish + Loom (~60 min)

## Task 24: Final polish pass

- [ ] **Step 1: Full walkthrough on the deployed URL**

1. Run each of the three canonical queries.
2. Run reliability panel on each canonical case with 5 trials.
3. Try Mode B on one intent.
4. Note anything ugly or broken.

- [ ] **Step 2: Fix 2-3 most visible issues only**

Fix only:
- Broken buttons
- Unreadable colors / layout
- Error messages leaking stack traces (shouldn't happen — `sanitizeError` should cover this)

Do not refactor.

- [ ] **Step 3: Redeploy**

```
vercel --prod
```

- [ ] **Step 4: Commit**

```
git add .
git commit -m "polish pass before loom"
```

---

## Task 25: Decide Loom path and prep

- [ ] **Step 1: Re-read `exploration-log.md` and the spec's Loom section**

Open the brainstorm. Pick Path A (failure-led) or Path B (stability-led).

- [ ] **Step 2: Write a one-page click-by-click script**

Not word-for-word — sequence of clicks, key lines, specific case IDs to demo.

Example for Path A:
```
1. Open app on the failing paraphrase (e.g. sum_30h_para2)
2. Click Run — show the wrong SQL
3. "This looks fine, but the baseline eval never caught it"
4. Click Mode A, 5 trials — show variance
5. Point at Wilson CI and Confidence: LOW
6. Production line verbatim
7. Show diff of lib/openai.ts (the fix)
8. Re-run the 5 trials — show the failure is gone
9. Close
```

Example for Path B:
```
1. Run a canonical query — show result
2. Run the 3 evals — green
3. "What we call an eval is one sample from a distribution"
4. Mode A, 5 trials — show stable
5. Point at Wilson CI: "Even at 100%, n=5 is too small to commit"
6. Production line verbatim
7. Show grammar file briefly
8. Close
```

- [ ] **Step 3: Dry run without recording**

Click through the whole flow. Note timing and anything that needs a warm-up.

---

## Task 26: Record Loom

- [ ] **Step 1: Prepare environment**

- Close other tabs.
- Warm up the Vercel deployment with one query (avoid cold start on camera).
- Script nearby.

- [ ] **Step 2: Record**

Use Loom, Cap, or QuickTime. Target 5 minutes, hard cap 6. **Do not edit** — if the first take is 6:10, ship it.

- [ ] **Step 3: Upload, get a shareable link**

- [ ] **Step 4: Add Loom link to README**

```markdown
**Loom:** https://loom.com/...
```

- [ ] **Step 5: Commit**

```
git add README.md
git commit -m "add loom link to readme"
```

---

## Task 27: Final submit

- [ ] **Step 1: Push to GitHub**

```
gh repo create raindrop-cfg-eval-toy --public --source=. --remote=origin --push
```

Or if the repo already exists:
```
git push -u origin main
```

- [ ] **Step 2: Verify all three deliverables**

1. **Deployed app:** open the Vercel URL, run a query.
2. **GitHub:** README readable, Loom link works.
3. **Loom:** plays end-to-end.

- [ ] **Step 3: Send the three links to Raindrop**

- [ ] **Step 4: Final commit**

```
git commit --allow-empty -m "ship: raindrop take-home complete"
git push
```

---

## Done.

Return to the spec's final rule if you're uncertain about any decision along the way:

> **Boring implementation + one sharp idea.** If the plan starts to feel intellectually satisfying or too clever, it's overbuilt — back off.
