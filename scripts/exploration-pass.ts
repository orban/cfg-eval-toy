// Exploration pass: runs every eval case N times, groups by exact raw SQL,
// and reports per-case pass rate + Wilson 95% CI + distinct variant count.
//
// Unlike /api/eval (capped at 5 trials per case by Vercel Hobby's 60s function
// timeout), this script runs locally against ClickHouse Cloud + GPT-5 and can
// push canonical cases to 10 trials for tighter confidence intervals. This is
// the experiment that decides Loom Path A vs Path B:
//
//   - All cases at 100% pass with 1 variant each  → Path B (stability is the
//     measurement — run the same thing N times, show it's actually stable)
//   - Any case with failures                       → Path A candidate (lead
//     with the failure, use the reliability panel to characterize it)
//   - Multi-variant SQL but passing                → middle ground (stable
//     outcome, varying form — worth a brief mention)
//
// Run: npx tsx --env-file=.env.local scripts/exploration-pass.ts

import { loadEvalCases } from "../lib/eval-cases";
import { runTrial } from "../lib/eval-runner";
import { wilsonCI, confidenceLabel, type ConfidenceInterval } from "../lib/stats";
import type { EvalCase, TrialResult } from "../lib/types";

const TRIALS_CANONICAL = 10;
const TRIALS_PARAPHRASE = 5;
const TRIALS_EDGE = 5;

type Kind = "canonical" | "paraphrase" | "edge";

function classify(c: EvalCase): Kind {
  if (c.canonical) return "canonical";
  if (c.intent.startsWith("edge_")) return "edge";
  return "paraphrase";
}

function trialsFor(kind: Kind): number {
  if (kind === "canonical") return TRIALS_CANONICAL;
  if (kind === "edge") return TRIALS_EDGE;
  return TRIALS_PARAPHRASE;
}

interface VariantGroup {
  sql: string;
  count: number;
  passedCount: number;
  failedCount: number;
  firstError?: string;
}

// Group by exact raw SQL — no canonicalization, matches the reliability
// panel in production. Two trials that differ only in whitespace get listed
// separately. Collapsing them would hide real variance.
function groupVariants(trials: TrialResult[]): VariantGroup[] {
  const map = new Map<string, VariantGroup>();
  for (const t of trials) {
    const key = t.sql || "(no SQL)";
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (t.passed) {
        existing.passedCount += 1;
      } else {
        existing.failedCount += 1;
        if (!existing.firstError) existing.firstError = t.error;
      }
    } else {
      map.set(key, {
        sql: key,
        count: 1,
        passedCount: t.passed ? 1 : 0,
        failedCount: t.passed ? 0 : 1,
        firstError: t.passed ? undefined : t.error,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

interface CaseReport {
  id: string;
  intent: string;
  kind: Kind;
  total: number;
  variants: VariantGroup[];
  passes: number;
  passRate: number;
  ci: ConfidenceInterval;
  confidence: ReturnType<typeof confidenceLabel>;
}

async function main() {
  const cases = loadEvalCases();
  const totalTrials = cases.reduce((n, c) => n + trialsFor(classify(c)), 0);
  const start = Date.now();

  console.log("=============================");
  console.log(" EXPLORATION PASS");
  console.log(` ${cases.length} cases, ${totalTrials} total trials`);
  console.log(
    ` canonical=${TRIALS_CANONICAL}  paraphrase=${TRIALS_PARAPHRASE}  edge=${TRIALS_EDGE}`
  );
  console.log("=============================\n");

  const reports: CaseReport[] = [];

  for (const c of cases) {
    const kind = classify(c);
    const n = trialsFor(kind);
    const tag = `[${kind}]`.padEnd(12);
    process.stdout.write(`${tag} ${c.id.padEnd(34)} `);

    const trials: TrialResult[] = [];
    for (let i = 0; i < n; i++) {
      const t = await runTrial(c);
      trials.push(t);
      process.stdout.write(t.passed ? "." : "F");
    }

    const passes = trials.filter((t) => t.passed).length;
    const passRate = passes / trials.length;
    const ci = wilsonCI(passes, trials.length);
    const confidence = confidenceLabel(ci);
    const variants = groupVariants(trials);

    console.log(
      `  ${passes}/${n}  ${variants.length} variant${variants.length === 1 ? "" : "s"}  ${confidence}`
    );

    reports.push({
      id: c.id,
      intent: c.intent,
      kind,
      total: trials.length,
      variants,
      passes,
      passRate,
      ci,
      confidence,
    });
  }

  const elapsed = (Date.now() - start) / 1000;
  console.log(`\nDone in ${elapsed.toFixed(1)}s (${totalTrials} trials total)\n`);

  // Per-case detail
  console.log("=============================");
  console.log(" PER-CASE DETAIL");
  console.log("=============================\n");
  for (const r of reports) {
    console.log(`[${r.kind}] ${r.id}`);
    console.log(`  pass:     ${r.passes}/${r.total} (${(r.passRate * 100).toFixed(0)}%)`);
    console.log(
      `  CI 95%:   [${r.ci.low.toFixed(2)}, ${r.ci.high.toFixed(2)}]  ${r.confidence}`
    );
    console.log(`  variants: ${r.variants.length}`);
    for (let i = 0; i < r.variants.length; i++) {
      const v = r.variants[i];
      const mark =
        v.failedCount === 0 ? "PASS " : v.passedCount === 0 ? "FAIL " : "MIXED";
      console.log(`    #${i + 1} [${mark}] ×${v.count}`);
      console.log(`       ${v.sql || "(no SQL)"}`);
      if (v.firstError) console.log(`       error: ${v.firstError}`);
    }
    console.log();
  }

  // Summary
  console.log("=============================");
  console.log(" SUMMARY");
  console.log("=============================\n");

  const byKind = new Map<Kind, { clean: number; total: number }>();
  for (const r of reports) {
    const entry = byKind.get(r.kind) ?? { clean: 0, total: 0 };
    entry.total += 1;
    if (r.passes === r.total) entry.clean += 1;
    byKind.set(r.kind, entry);
  }
  for (const kind of ["canonical", "paraphrase", "edge"] as Kind[]) {
    const stats = byKind.get(kind);
    if (!stats) continue;
    console.log(`  ${kind.padEnd(11)} ${stats.clean}/${stats.total} cases at 100% pass`);
  }
  console.log();

  const failed = reports.filter((r) => r.passes < r.total);
  const multiVariantPassing = reports.filter(
    (r) => r.passes === r.total && r.variants.length > 1
  );

  if (failed.length > 0) {
    console.log("Cases with failures:");
    for (const r of failed) {
      console.log(
        `  * ${r.id}  ${r.passes}/${r.total}  CI=[${r.ci.low.toFixed(
          2
        )}, ${r.ci.high.toFixed(2)}]  ${r.confidence}`
      );
    }
    console.log();
  }

  if (multiVariantPassing.length > 0) {
    console.log("Cases passing with multi-variant SQL (stable outcome, varying form):");
    for (const r of multiVariantPassing) {
      console.log(
        `  * ${r.id}  ${r.variants.length} variants, all ${r.passes}/${r.total} passed`
      );
    }
    console.log();
  }

  // Verdict hint
  console.log("-----------------------------");
  if (failed.length === 0 && multiVariantPassing.length === 0) {
    console.log("VERDICT HINT: all cases 100% pass, 1 variant each");
    console.log("              → Path B (clean stability story)");
  } else if (failed.length > 0) {
    console.log("VERDICT HINT: failures detected");
    console.log("              → Path A candidate(s) above");
  } else {
    console.log("VERDICT HINT: no failures, but syntactic drift present");
    console.log("              → Path B with a middle-ground mention");
  }
  console.log("-----------------------------");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
