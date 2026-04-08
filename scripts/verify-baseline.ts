// Runs the 3 canonical cases through the eval runner once each and prints
// a pass/fail summary. This is the "3 baseline evals pass" deliverable.
//
// Run: npx tsx --env-file=.env.local scripts/verify-baseline.ts

import { getCanonicalCases } from "../lib/eval-cases";
import { runTrial } from "../lib/eval-runner";

async function main() {
  const cases = getCanonicalCases();
  console.log(`Running ${cases.length} canonical cases...\n`);

  let passCount = 0;

  for (const c of cases) {
    const result = await runTrial(c);
    const mark = result.passed ? "PASS" : "FAIL";
    console.log(`[${mark}] ${c.id}`);
    console.log(`  NL:    ${c.nl}`);
    console.log(`  SQL:   ${result.sql || "(none)"}`);
    console.log(`  stage: ${result.stage}`);
    if (result.error) console.log(`  error: ${result.error}`);
    if (result.failedPatterns) console.log(`  failed: ${result.failedPatterns.join(", ")}`);
    if (result.rows) console.log(`  rows:  ${result.rows.length}`);
    console.log();
    if (result.passed) passCount += 1;
  }

  console.log(`Summary: ${passCount}/${cases.length} passed`);
  if (passCount !== cases.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
