---
status: pending
priority: p3
issue_id: 007
tags: [code-review, quality, batch]
dependencies: []
---

# P3: Batched code nits

## Problem Statement

Several small quality improvements flagged across reviewers. None are blocking, all are 1-2 line fixes. Batched here so they can be fixed in one pass if time permits, or skipped without consequence.

## Findings

### Type duplication

`lib/types.ts` `QueryResult` and `lib/pipeline.ts` `PipelineResult` are structurally identical. Pick one and re-export. Flagged by: kieran-typescript-reviewer (MED #8).

### Unused sanitize-error type surface

`lib/sanitize-error.ts` exports `ErrorClass` union and `SanitizedError` interface, but `pipeline.ts` only reads `err.message`. The classification runs, gets logged, then the class is thrown away. Either drop the union from the exported API or actually surface `class` in the response. Flagged by: code-simplicity-reviewer.

### Controlled-ish select in UI

`app/page.tsx:43` — the example select uses `defaultValue` while an adjacent textarea is fully controlled with `value={nl}`. If the user types in the textarea then picks a new example from the dropdown, the select can visually drift. Make the select fully controlled with `value={nl}`. Flagged by: kieran-typescript-reviewer (NIT).

### Module-level grammar load

`lib/openai.ts:10` — `readFileSync(join(process.cwd(), "grammar/orders.lark"))` at module top. A missing grammar file crashes Next on first import with no context. Lazy-load in `generateSql` with a descriptive error. Flagged by: kieran-typescript-reviewer (NIT).

### Env var presence

`lib/clickhouse.ts:11-13` — `process.env.CLICKHOUSE_URL` is `string | undefined`. Client likely tolerates it but asserting presence at boot gives a better error than a timeout when the URL is missing. Flagged by: kieran-typescript-reviewer (NIT).

### Naive CSV parser

`scripts/ingest.ts:33` — `line.split(",")` will corrupt any cell containing a comma. Fine for the seeded dataset, but worth a `// TODO` comment. Flagged by: kieran-typescript-reviewer (NIT).

### Hardcoded model name

`lib/openai.ts:9` — `MODEL = "gpt-5"` hardcoded. An env override (`process.env.OPENAI_MODEL ?? "gpt-5"`) is one line and lets you swap models without a code change. Flagged by: kieran-typescript-reviewer (NIT).

### Cache lifetime of pinned-now

`lib/pinned-now.ts` — `cached` is process-lifetime. If you re-ingest the dataset the dev server keeps the old pin. Comment this or expose a reset function. Flagged by: kieran-typescript-reviewer (NIT), silent-failure-hunter (LOW).

### Zod validation of cases.yaml

`lib/eval-cases.ts:33` — `parse(raw) as EvalCase[]` is a cast with no runtime check. A malformed YAML surfaces as a `Cannot read properties of undefined` deep in `checkPatterns`. Flagged by: kieran-typescript-reviewer (MED #7). Not worth a zod dependency for a take-home; a three-line shape check is enough.

## Proposed Solutions

### Option A (Recommended) — One cleanup commit before Phase 5

Fix all nine in one pass. Each is 1-2 lines. Total effort ~20 min.

**Pros:** removes the batched noise from the codebase before Phase 5 starts.
**Cons:** eats 20 min of the remaining budget.
**Effort:** Small.
**Risk:** None.

### Option B — Skip entirely

**Pros:** saves 20 min.
**Cons:** the nits stay as paper cuts every time you touch the files.
**Effort:** Zero.
**Risk:** None.

## Recommended Action

Option B unless the P1/P2 fixes finish with >20 min to spare.

## Technical Details

**Affected files:** `lib/types.ts`, `lib/pipeline.ts`, `lib/sanitize-error.ts`, `app/page.tsx`, `lib/openai.ts`, `lib/clickhouse.ts`, `lib/pinned-now.ts`, `scripts/ingest.ts`, `lib/eval-cases.ts`.

## Acceptance Criteria

See individual findings above.

## Work Log

(unstarted)
