---
status: pending
priority: p2
issue_id: 004
tags: [code-review, testing, regression-guard]
dependencies: []
---

# P2: One unit test for splitInlineFlags + checkPatterns

## Problem Statement

The `checkPatterns` function in `lib/eval-runner.ts` is the only thing standing between "the model regressed" and "looks fine to me" in the reliability panel. A silent failure here means every eval result lies — you think 10/10 passed when actually the regex never compiled. I just caught exactly this bug in commit c3b52b9 (JavaScript doesn't support `(?i)` inline flags). The fix works, but there's no test preventing regression.

Flagged by: pr-test-analyzer (P1), silent-failure-hunter (adjacent).

## Findings

`lib/eval-runner.ts:11-31` contains two pure functions:
- `splitInlineFlags(pattern)` — extracts `(?flags)` prefix
- `checkPatterns(sql, patterns)` — runs each pattern regex against the SQL, returns list of failed pattern names

These are pure, cheap to test, and the exact kind of logic where a silent regression is catastrophic for the reliability panel's credibility.

## Proposed Solutions

### Option A (Recommended) — Three targeted tests, 10 minutes

Create `lib/eval-runner.test.ts` with three cases:

1. **Inline flag is applied:** `(?i)SELECT` against `select * from t` returns `[]` (i.e., the flag works, no failed patterns).
2. **Negative case fires:** `\\bGROUP BY\\b` against `SELECT * FROM t` returns `["name"]` (missing GROUP BY is correctly reported).
3. **Malformed regex doesn't crash:** `(?i)[unclosed` returns `["name"]` and the test passes without throwing. This is the regression guard for the bug that was just fixed.

Export `splitInlineFlags` and `checkPatterns` from `lib/eval-runner.ts` (currently local — small export).

**Pros:** highest-leverage test in the repo, ~10 min of work, runs in CI without ClickHouse or OpenAI.
**Cons:** need to export two functions currently private.
**Effort:** Small.
**Risk:** None.

### Option B — Skip, rely on `verify-baseline.ts`

**Pros:** zero time cost.
**Cons:** `verify-baseline.ts` requires ClickHouse and OpenAI to be up; can't run in CI; doesn't test the malformed-regex branch; bug that was just fixed could silently come back.
**Effort:** Zero.
**Risk:** Medium-High.

## Recommended Action

Option A. This is the only unit test worth writing before Phase 5's Wilson CI TDD.

## Technical Details

**Affected files:**
- `lib/eval-runner.ts` (export `splitInlineFlags`, `checkPatterns`)
- `lib/eval-runner.test.ts` (new)

## Acceptance Criteria

- [ ] `npm test` runs the new test file
- [ ] All three cases pass
- [ ] `checkPatterns` case for malformed regex does not throw, returns the pattern name in the failed list

## Work Log

(unstarted)
