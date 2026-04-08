// Runs a single eval case through the shared pipeline and checks the
// generated SQL against the case's expected_patterns. Pattern check is
// intentionally inline (~10 lines) rather than a separate module — it's a
// regex loop.

import { runPipeline } from "./pipeline";
import type { EvalCase, TrialResult } from "./types";

// Extracts an inline (?flags) prefix and returns [body, flags]. JavaScript
// RegExp doesn't accept inline flag syntax, so we handle it manually here.
export function splitInlineFlags(pattern: string): [string, string] {
  const match = pattern.match(/^\(\?([a-z]+)\)/);
  if (!match) return [pattern, ""];
  return [pattern.slice(match[0].length), match[1]];
}

export function checkPatterns(sql: string, patterns: Record<string, string>): string[] {
  const failed: string[] = [];
  for (const [name, pattern] of Object.entries(patterns)) {
    try {
      const [body, flags] = splitInlineFlags(pattern);
      if (!new RegExp(body, flags).test(sql)) failed.push(name);
    } catch (e) {
      // Malformed regex in cases.yaml — log server-side so it doesn't silently
      // look identical to a content miss, but don't crash the eval run.
      console.error(`[eval-runner] bad regex for pattern "${name}":`, e);
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
