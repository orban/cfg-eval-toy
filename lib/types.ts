// Shared types across the app.

export type Stage = "ok" | "grammar_fail" | "pattern_fail" | "db_fail" | "value_mismatch";

export interface QueryResult {
  sql: string;
  rows: Record<string, unknown>[] | null;
  elapsedMs: number;
  stage: Stage;
  error?: string;
}

export interface TrialResult {
  sql: string;
  passed: boolean;
  stage: Stage;
  rows?: Record<string, unknown>[];
  error?: string;
  failedPatterns?: string[];
}

export interface EvalCase {
  id: string;
  intent: string;
  nl: string;
  expected_patterns: Record<string, string>;
  canonical?: boolean;
  // Exact-value assertions (requires pinned NOW() for determinism).
  expected_scalar?: number;
  expected_scalar_tolerance?: number; // absolute tolerance, default 0.5% of value
  expected_row_count?: number;
  // For cases where the pipeline should land on one of a set of stages.
  // Accepts a single stage or an array. Edge cases like SQL injection are
  // legitimately non-deterministic: GPT-5 sometimes refuses (→ grammar_fail,
  // the refusal text fails the grammar) and sometimes emits a benign fallback
  // SELECT (→ ok, which is still safe because the grammar makes DROP/DELETE
  // grammatically impossible). Both outcomes are acceptable.
  expected_stage?: Stage | Stage[];
}
