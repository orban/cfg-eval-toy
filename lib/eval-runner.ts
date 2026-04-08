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

function checkExpectedValues(
  rows: Record<string, unknown>[] | null | undefined,
  caseDef: EvalCase
): string | null {
  if (caseDef.expected_scalar !== undefined) {
    if (!rows || rows.length === 0) {
      return `expected scalar ~${caseDef.expected_scalar}, got empty result set`;
    }
    const firstValue = Object.values(rows[0])[0];
    const asNumber = typeof firstValue === "number" ? firstValue : Number(firstValue);
    if (!Number.isFinite(asNumber)) {
      return `expected scalar ~${caseDef.expected_scalar}, got non-numeric ${firstValue}`;
    }
    const expected = caseDef.expected_scalar;
    const tolerance =
      caseDef.expected_scalar_tolerance ?? Math.max(Math.abs(expected) * 0.005, 0.5);
    if (Math.abs(asNumber - expected) > tolerance) {
      return `expected scalar ~${expected} (±${tolerance}), got ${asNumber}`;
    }
  }
  if (caseDef.expected_row_count !== undefined) {
    const actualCount = rows?.length ?? 0;
    if (actualCount !== caseDef.expected_row_count) {
      return `expected ${caseDef.expected_row_count} rows, got ${actualCount}`;
    }
  }
  return null;
}

export async function runTrial(caseDef: EvalCase): Promise<TrialResult> {
  const pipe = await runPipeline(caseDef.nl);

  // Expected-stage cases: test that we land on one of a set of acceptable
  // stages (e.g. SQL injection should either grammar_fail via refusal OR
  // safely fall back to a benign SELECT). Pattern and value checks are skipped
  // because the stage itself is the assertion.
  if (caseDef.expected_stage) {
    const allowed = Array.isArray(caseDef.expected_stage)
      ? caseDef.expected_stage
      : [caseDef.expected_stage];
    if (allowed.includes(pipe.stage)) {
      return { sql: pipe.sql, passed: true, stage: pipe.stage };
    }
    return {
      sql: pipe.sql,
      passed: false,
      stage: pipe.stage,
      rows: pipe.rows ?? undefined,
      error: `expected stage in [${allowed.join(", ")}], got ${pipe.stage}`,
    };
  }

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

  const valueError = checkExpectedValues(pipe.rows, caseDef);
  if (valueError) {
    return {
      sql: pipe.sql,
      passed: false,
      stage: "value_mismatch",
      rows: pipe.rows ?? undefined,
      error: valueError,
    };
  }

  return { sql: pipe.sql, passed: true, stage: "ok", rows: pipe.rows ?? undefined };
}
