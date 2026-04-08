// Single source of truth for the NL -> CFG -> SQL -> ClickHouse pipeline.
// Both the live query endpoint (/api/query) and the eval runner call runPipeline().
// This is the hinge: /api/query measures the same code path eval runs exercise.

import { generateSql } from "./openai";
import { runQuery } from "./clickhouse";
import { getPinnedNow, rewriteNowInSql } from "./pinned-now";
import { sanitizeError } from "./sanitize-error";
import type { Stage } from "./types";

export interface PipelineResult {
  sql: string;
  rows: Record<string, unknown>[] | null;
  elapsedMs: number;
  stage: Stage;
  error?: string;
}

export async function runPipeline(nl: string): Promise<PipelineResult> {
  const start = Date.now();

  let sql: string;
  try {
    sql = await generateSql(nl);
  } catch (e) {
    const err = sanitizeError(e, "generateSql");
    return {
      sql: "",
      rows: null,
      elapsedMs: Date.now() - start,
      stage: "grammar_fail",
      error: err.message,
    };
  }

  const pinnedNow = await getPinnedNow();
  const ready = rewriteNowInSql(sql, pinnedNow);
  const result = await runQuery(ready);

  if (!result.ok) {
    const err = sanitizeError(new Error(result.error), "runQuery");
    return {
      sql,
      rows: null,
      elapsedMs: Date.now() - start,
      stage: "db_fail",
      error: err.message,
    };
  }

  return {
    sql,
    rows: result.rows,
    elapsedMs: Date.now() - start,
    stage: "ok",
  };
}
