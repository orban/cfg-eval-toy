// Runs every case in evals/cases.yaml once and prints a full pass/fail summary.
// Slower than verify-baseline.ts (which only touches the 6 canonical cases)
// but useful for confirming paraphrases + edge cases also pass before a Loom
// recording or a deploy.
//
// Run: npx tsx --env-file=.env.local scripts/verify-all.ts

import { loadEvalCases } from "../lib/eval-cases";
import { runTrial } from "../lib/eval-runner";

async function main() {
  const cases = loadEvalCases();
  console.log(`Running ${cases.length} cases (canonical + paraphrase + edge)...\n`);

  const byIntent = new Map<string, { pass: number; fail: number; total: number }>();
  let totalPass = 0;

  for (const c of cases) {
    const result = await runTrial(c);
    const mark = result.passed ? "PASS" : "FAIL";
    const tag = c.canonical ? "[canonical]" : c.intent.startsWith("edge_") ? "[edge]" : "[para]";
    console.log(`${tag.padEnd(12)} [${mark}] ${c.id}`);
    if (!result.passed) {
      console.log(`             error: ${result.error ?? "(none)"}`);
      if (result.sql) console.log(`             sql:   ${result.sql}`);
    }

    const existing = byIntent.get(c.intent) ?? { pass: 0, fail: 0, total: 0 };
    existing.total += 1;
    if (result.passed) {
      existing.pass += 1;
      totalPass += 1;
    } else {
      existing.fail += 1;
    }
    byIntent.set(c.intent, existing);
  }

  console.log();
  console.log("By intent:");
  for (const [intent, stats] of byIntent.entries()) {
    const mark = stats.fail === 0 ? "✓" : "✗";
    console.log(`  ${mark} ${intent.padEnd(30)} ${stats.pass}/${stats.total}`);
  }

  console.log();
  console.log(`Total: ${totalPass}/${cases.length} passed`);
  if (totalPass !== cases.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
