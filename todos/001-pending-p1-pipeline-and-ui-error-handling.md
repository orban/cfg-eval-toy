---
status: pending
priority: p1
issue_id: 001
tags: [code-review, reliability, silent-failure, loom-blocker]
dependencies: []
---

# P1: Pipeline + UI error handling — demo blockers

## Problem Statement

Three independent paths in the pipeline can throw raw errors that bypass `sanitizeError`, causing either a frozen UI or a Next.js stack-trace 500 page during the Loom recording. All three were flagged by multiple reviewers. Any one of these firing during the 5-minute recording is a Loom killer.

## Findings

### A. `lib/pipeline.ts:36-49` — unwrapped `getPinnedNow()` and downstream calls

Flagged by: kieran-typescript-reviewer (HIGH #1), silent-failure-hunter (HIGH #2).

The `try/catch` only wraps `generateSql()`. `getPinnedNow()`, `runQuery()`, and the downstream path have no wrapper. If ClickHouse is down on the first query (cache empty), `getPinnedNow` throws and the rejection escapes `runPipeline` entirely — bypassing `sanitizeError`, bypassing the `db_fail` stage, and surfacing as an unhandled rejection.

```ts
// Current (lib/pipeline.ts:21-49)
let sql: string;
try {
  sql = await generateSql(nl);
} catch (e) { /* handled */ }

const pinnedNow = await getPinnedNow();  // <-- can throw, unhandled
const ready = rewriteNowInSql(sql, pinnedNow);
const result = await runQuery(ready);    // <-- runQuery is wrapped internally, ok
```

### B. `app/page.tsx:21-29` — `runQueryCall` has no error handling

Flagged by: kieran-typescript-reviewer (HIGH #4), silent-failure-hunter (HIGH #1).

No `try/catch`, no `res.ok` check. If fetch rejects (network, 500 from server, non-JSON body), `setLoading(false)` never runs. The button stays "Running..." forever.

```tsx
// Current
async function runQueryCall() {
  setLoading(true);
  setResult(null);
  const res = await fetch("/api/query", { ... });
  const data = (await res.json()) as QueryResult;
  setResult(data);
  setLoading(false);
}
```

### C. `lib/pinned-now.ts:19` — `rows[0].pinned` without guard

Flagged by: kieran-typescript-reviewer (HIGH #2).

```ts
const rows = (await result.json()) as { pinned: string }[];
cached = rows[0].pinned;  // throws on empty result; cache stays null, every call re-throws
```

## Proposed Solutions

### Option A (Recommended) — Fix all three inline, one commit

1. In `lib/pipeline.ts`, wrap the post-grammar block in a try/catch that returns the `db_fail` stage via `sanitizeError`.
2. In `app/page.tsx runQueryCall`, wrap in try/catch/finally; on catch, set result to a synthetic `{stage: "grammar_fail", error: msg}`; move `setLoading(false)` to `finally`. Check `res.ok` before `.json()`.
3. In `lib/pinned-now.ts`, guard `if (!rows[0]?.pinned) throw new Error("pinned-now: orders table is empty")` so the failure is named.

**Pros:** kills three demo blockers in one ~20-line change.
**Cons:** none realistic.
**Effort:** Small (~15 min).
**Risk:** Low.

### Option B — Split across phases

Fix the page.tsx one now (affects every user action), defer the pipeline and pinned-now fixes to Phase 6 polish.

**Pros:** smaller blast radius per commit.
**Cons:** the pipeline bug is just as demo-critical as the UI bug.
**Effort:** Small.
**Risk:** Medium — if the pipeline bug fires during Phase 4 Mode A testing, you lose trial data and debugging time.

## Recommended Action

Option A. One commit before Phase 4.

## Technical Details

**Affected files:**
- `lib/pipeline.ts`
- `app/page.tsx`
- `lib/pinned-now.ts`

**No database changes.**

## Acceptance Criteria

- [ ] `runPipeline` returns a typed `PipelineResult` in all failure modes, never throws
- [ ] Killing ClickHouse mid-query produces a `db_fail` result with a sanitized message, not a frozen spinner or a 500 page
- [ ] `runQueryCall` in the UI sets loading=false in all paths
- [ ] Empty orders table produces a named error, not `Cannot read properties of undefined`

## Work Log

(unstarted)
