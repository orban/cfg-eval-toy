// Shared types across the app.

export type Stage = "ok" | "grammar_fail" | "pattern_fail" | "db_fail";

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
}
