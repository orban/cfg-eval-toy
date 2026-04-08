---
status: pending
priority: p2
issue_id: 005
tags: [code-review, reliability, debugging]
dependencies: []
---

# P2: Preserve error cause and tighten sanitizeError classification

## Problem Statement

Three small error-propagation holes cost ~30 minutes of debugging time each if they fire during development:

1. `lib/clickhouse.ts:30` string-serializes the error and drops `.cause` and `.stack`, losing the ClickHouse `Code: N, DB::Exception` line that tells you which column doesn't exist.
2. `lib/pipeline.ts:41` re-wraps the stringified error in a fresh `Error`, losing it a second time.
3. `lib/sanitize-error.ts` has an `unknown` bucket that classifies OpenAI auth errors, OpenAI rate limits, and network `ETIMEDOUT` all as "request failed" — the client UI becomes useless for distinguishing "OpenAI broke" from "ClickHouse broke".

Flagged by: silent-failure-hunter (MED #3 and #4).

## Findings

### Loss of error cause in runQuery

`lib/clickhouse.ts:30-32`:
```ts
} catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}
```

No `console.error(e)` first. The raw `DB::Exception` message with error code is gone.

### Re-wrapping destroys context

`lib/pipeline.ts:41`:
```ts
const err = sanitizeError(new Error(result.error), "runQuery");
```

Wraps the already-stringified message in a fresh `Error()`, which `sanitizeError` then pattern-matches against. The original error object is long gone.

### Too-broad unknown bucket

`lib/sanitize-error.ts` has branches for `grammar_tool_error`, `grammar_tool_empty`, `db_timeout`, `db_query_error`, and a fallback to "request failed". It's missing:
- OpenAI 401 / unauthorized
- Network `ECONNREFUSED` / `ENOTFOUND` / `fetch failed`

### Missing log when model emits no tool call

`lib/openai.ts:71` throws `"grammar-constrained generation returned no SQL"` without logging the response shape. If the SDK changes field names and `output` becomes undefined, you'd spend 20 min thinking the model returned nothing when you're reading the wrong field.

## Proposed Solutions

### Option A (Recommended) — Fix all four inline

1. In `lib/clickhouse.ts`, add `console.error("[runQuery]", e);` before the return. Pass the original `e` object all the way through.
2. In `lib/pipeline.ts`, change `sanitizeError(new Error(result.error), "runQuery")` to `sanitizeError(runQueryCatchObject, "runQuery")` — requires returning the `Error` from `runQuery` instead of a string.
3. In `lib/sanitize-error.ts`, add two more branches: `openai_auth_error` (401/unauthorized) and `upstream_unreachable` (econnrefused/enotfound/fetch failed).
4. In `lib/openai.ts`, add `console.error("[generateSql] no tool call in output", JSON.stringify(output));` before the throw.

**Pros:** five debugging traps disarmed with ~15 lines of change.
**Cons:** minor type changes in runQuery's return shape.
**Effort:** Small (~10 min).
**Risk:** Low.

### Option B — Accept as-is

The `console.error` in `sanitizeError` itself logs the original error, which is enough for server-side debugging. Client-side error messages stay vague but that's arguably fine for a demo.

**Pros:** zero time cost.
**Cons:** first time you hit a ClickHouse SQL error in Phase 4 you'll waste 20 min.
**Effort:** Zero.
**Risk:** Medium.

## Recommended Action

Option A. All four are one-line fixes and the payoff is concrete — next time you break a grammar rule in Phase 6 (failure tagger + fix beat) you'll actually see why.

## Technical Details

**Affected files:**
- `lib/clickhouse.ts`
- `lib/pipeline.ts`
- `lib/sanitize-error.ts`
- `lib/openai.ts`

## Acceptance Criteria

- [ ] A forced ClickHouse error shows up in server logs with full stack and Code
- [ ] `sanitizeError` classifies `401 Unauthorized` as auth error, `ECONNREFUSED` as unreachable
- [ ] When GPT-5 emits plain text (no tool call), the full output shape logs to stderr before throwing

## Work Log

(unstarted)
