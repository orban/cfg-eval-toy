---
status: pending
priority: p2
issue_id: 003
tags: [code-review, simplicity, drift]
dependencies: []
---

# P2: Trim premature eval-cases helpers and /api/cases route

## Problem Statement

`lib/eval-cases.ts` and `app/api/cases/route.ts` were built one phase ahead of need. The reliability panel UI (Phase 4) hasn't been written yet, but the case-shaping layer and the REST route that serves it already exist with zero callers except `verify-baseline.ts`, which only uses `getCanonicalCases`.

Flagged by: code-simplicity-reviewer.

## Findings

### Dead exports in `lib/eval-cases.ts:21-67`

Only `loadEvalCases` + `getCanonicalCases` have callers today. These are unused:

- `INTENT_LABELS` constant
- `CaseSummary` interface
- `IntentSummary` interface
- `getCasesByIntent`
- `getCaseById`
- `getIntentSummaries`
- `getCaseSummaries`

~35 LOC of code that exists "for the Mode A UI that will consume it in Phase 4".

### Entire file dead: `app/api/cases/route.ts`

No client fetches it. It returns `{canonical, intents, cases}` shape for a UI that doesn't exist.

### Related dead field

`lib/types.ts:21` — `failureMode?: string` on `TrialResult` is unused. It's for the Phase 6 failure tagger.

## Proposed Solutions

### Option A (Recommended) — Delete now, rebuild when needed

1. Shrink `lib/eval-cases.ts` to `loadEvalCases` + `getCanonicalCases` only
2. Delete `app/api/cases/route.ts`
3. Delete `failureMode?: string` from `TrialResult`
4. Re-add in Phase 4 (when UI consumes it) and Phase 6 (when tagger populates it)

**Pros:** removes "what calls this?" cognitive tax, honors the "boring + one sharp idea" rule, ~60 LOC dropped.
**Cons:** will need to re-add in Phase 4 and Phase 6.
**Effort:** Small (~10 min).
**Risk:** None.

### Option B — Accept the drift, document intent

Add a comment "built for Phase 4, unused until then". Move on.

**Pros:** zero risk of deleting something you'll need.
**Cons:** the whole point of the review was catching this; leaving drift in place undermines the discipline.
**Effort:** Trivial.
**Risk:** Medium — code drift compounds.

### Option C — Build Phase 4 immediately instead

Go build the reliability panel UI *now* so the helpers have callers.

**Pros:** turns drift into intended state.
**Cons:** violates "phase-at-a-time" execution plan; reviewer hasn't checked in yet.
**Effort:** Medium.
**Risk:** scope creep.

## Recommended Action

Option A. Delete the dead code now, re-add surgically in Phase 4 (Task 16 reliability panel UI).

## Technical Details

**Affected files:**
- `lib/eval-cases.ts` (shrink)
- `app/api/cases/route.ts` (delete)
- `lib/types.ts` (remove `failureMode`)

## Acceptance Criteria

- [ ] `tsc --noEmit` passes after deletion
- [ ] `scripts/verify-baseline.ts` still runs 3/3 passing
- [ ] `lib/eval-cases.ts` exports exactly `loadEvalCases` + `getCanonicalCases`
- [ ] `app/api/cases/` does not exist

## Work Log

(unstarted)
