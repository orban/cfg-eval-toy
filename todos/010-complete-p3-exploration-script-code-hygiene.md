---
status: pending
priority: p3
issue_id: 010
tags: [code-review, quality, exploration-pass, local-only]
dependencies: []
---

# P3: Exploration script code hygiene (batched)

## Problem Statement

Multiple minor code quality issues in `scripts/exploration-pass.ts`. **Note: this file is NOT being committed to the repo per user directive.** These fixes are purely for local-script quality. They do not affect the shipping submission. Skip entirely unless the user wants to keep the local script reusable for future experiments.

## Findings

### Type duplication: `ci: { low: number; high: number }` should reuse `ConfidenceInterval`

**Location:** `scripts/exploration-pass.ts:86`

The `CaseReport` interface declares `ci: { low: number; high: number }` inline while `lib/stats.ts` already exports `ConfidenceInterval` with the same shape. Structurally compatible but creates a nominal/visual inconsistency with `app/api/eval/route.ts:13` which does import the type.

**Fix:** Add to the existing import:
```ts
import { wilsonCI, confidenceLabel, type ConfidenceInterval } from "../lib/stats";
// ...
ci: ConfidenceInterval;
```

Flagged by: kieran-typescript-reviewer (P2), architecture-strategist (P3).

### Type duplication: `confidence: "LOW" | "MED" | "HIGH"` should use ReturnType

**Location:** `scripts/exploration-pass.ts:87`

`confidenceLabel` already returns `"LOW" | "MED" | "HIGH"`. Re-typing it in `CaseReport` is a hand-typed annotation that drifts silently if the label set ever changes.

**Fix:**
```ts
confidence: ReturnType<typeof confidenceLabel>;
```

Flagged by: kieran-typescript-reviewer (P2).

### Dead field: `CaseReport.trials` stores 140 TrialResult objects but only `.length` is read

**Location:** `scripts/exploration-pass.ts:82` and reads at lines 132, 150, 152, 175, 194

After the main loop computes `passes`, `passRate`, `ci`, `confidence`, and `variants`, nothing downstream touches individual trials. Every `r.trials.length` read equals `trialsFor(r.kind)`, and `passes` is already stored. The field holds 140 full trial objects in memory after they're no longer needed.

**Fix:** Replace `trials: TrialResult[]` with `total: number` in `CaseReport`, store `trials.length` into it in the loop, and swap the five `r.trials.length` reads for `r.total`.

Flagged by: code-simplicity-reviewer (P2).

### Defensive per-trial try/catch (optional robustness)

**Location:** `scripts/exploration-pass.ts:113`

`await runTrial(c)` is not wrapped in try/catch. `runPipeline` already catches pipeline errors and returns structured `TrialResult` with `stage: "grammar_fail"` or `"db_fail"`, and the script ran 140/140 successfully — so there's no concrete demonstrated throw path. But any future re-run could surface an unexpected throw from a library update, and the current behavior (script crashes mid-loop, partial log with no SUMMARY) is harder to diagnose than recording the throw as a structured fail.

Note: silent-failure-hunter's specific claim about `Number(BigInt)` throwing is incorrect — `Number(bigint)` converts cleanly; only unary `+bigint` throws. So the BigInt concern for `count(*)` queries does not apply. But the general defensive-wrap pattern is still a cheap resilience win.

**Fix (optional, 8 lines):**
```ts
let t: TrialResult;
try {
  t = await runTrial(c);
} catch (e) {
  t = {
    sql: "",
    passed: false,
    stage: "db_fail",
    error: `runTrial threw: ${e instanceof Error ? e.message : String(e)}`,
  };
}
trials.push(t);
```

Flagged by: silent-failure-hunter (originally P2, downgraded to P3 after correcting the BigInt claim).

## Proposed Solutions

### Option A — Apply all four fixes

**Pros:** Local script is clean and reusable.
**Cons:** ~10 min of work on a file that isn't being committed.
**Effort:** Small.
**Risk:** None.

### Option B (Recommended) — Skip entirely

**Pros:** Zero effort. The script is throwaway; these fixes never ship.
**Cons:** If the user later wants to run another exploration pass, the script has minor quality debt.

## Recommended Action

**Option B.** The script is uncommitted and won't be used again after tomorrow's Loom. Polishing it is pure ceremony.

## Technical Details

**Affected files:** `scripts/exploration-pass.ts` (local only, not committed)

## Acceptance Criteria

(Only applies if Option A is chosen)
- [ ] `CaseReport.ci` uses `ConfidenceInterval` from `lib/stats.ts`
- [ ] `CaseReport.confidence` uses `ReturnType<typeof confidenceLabel>`
- [ ] `CaseReport.trials` field replaced with `total: number`
- [ ] Per-trial try/catch wraps `await runTrial(c)`

## Work Log

(unstarted)
