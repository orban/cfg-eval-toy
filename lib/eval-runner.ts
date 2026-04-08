// Runs a single eval case through the shared pipeline and checks the
// generated SQL against the case's expected_patterns. Pattern check is
// intentionally inline (~10 lines) rather than a separate module — it's a
// regex loop.

import { runPipeline } from "./pipeline";
import type { EvalCase, TrialResult } from "./types";

function checkPatterns(sql: string, patterns: Record<string, string>): string[] {
  const failed: string[] = [];
  for (const [name, pattern] of Object.entries(patterns)) {
    try {
      if (!new RegExp(pattern).test(sql)) failed.push(name);
    } catch {
      // Malformed regex in cases.yaml — treat as a miss rather than crash.
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
    };
  }

  return { sql: pipe.sql, passed: true, stage: "ok", rows: pipe.rows ?? undefined };
}
