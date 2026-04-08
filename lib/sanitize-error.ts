// Classifies an unknown error into a client-safe string and logs the full
// error server-side. Every error that crosses an API route boundary goes
// through this so raw SDK/DB errors (with host:port, request IDs, stack frames)
// stay out of the response body.

export type ErrorClass =
  | "grammar_tool_error"
  | "grammar_tool_empty"
  | "openai_auth_error"
  | "upstream_unreachable"
  | "db_query_error"
  | "db_timeout"
  | "unknown";

export interface SanitizedError {
  class: ErrorClass;
  message: string;
}

// Intentionally lossy substring classifier. The server log (below) is the
// source of truth — this function only produces a short, client-safe label.
export function sanitizeError(e: unknown, stage: string): SanitizedError {
  console.error(`[${stage}]`, e);

  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (lower.includes("grammar") && (lower.includes("constrained") || lower.includes("no sql"))) {
    return { class: "grammar_tool_error", message: "grammar-constrained generation failed" };
  }
  if (lower.includes("did not return") || lower.includes("empty sql") || lower.includes("returned no sql")) {
    return { class: "grammar_tool_empty", message: "model returned no SQL" };
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key")) {
    return { class: "openai_auth_error", message: "OpenAI auth failed" };
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network error")
  ) {
    return { class: "upstream_unreachable", message: "upstream unreachable" };
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return { class: "db_timeout", message: "database query timed out" };
  }
  if (lower.includes("clickhouse") || lower.includes("code:") || lower.includes("syntax error") || lower.includes("db::exception")) {
    return { class: "db_query_error", message: "database rejected the generated query" };
  }
  return { class: "unknown", message: "request failed" };
}
