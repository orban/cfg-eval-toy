---
status: pending
priority: p3
issue_id: 011
tags: [code-review, documentation, polish]
dependencies: []
---

# P3: README prose trim and cases.yaml reviewer-friendliness

## Problem Statement

Two small presentation polish items flagged by reviewers. Both affect shipping artifacts but neither is critical.

## Findings

### README "sharpest example" prose is slightly redundant with the code block and table below it

**Location:** `README.md` "Exploration pass" section

The paragraph says "`count_over_200_30d_canonical` produced a clean 5/5 split across two distinct WHERE-clause orderings, literally a coin flip." The code block then shows the two orderings. The drift-kinds table below has a row "Predicate order flip `A AND B` ⇄ `B AND A` | 6" which says it a third time.

The code block is the most visceral and specific — that's the one that should carry the weight. The drift-kinds table is load-bearing because it quantifies the phenomenon across cases. Trimming the prose sentence lets the code block do the work.

**Fix:** Change the lead-in sentence to something like:
> The sharpest example: `count_over_200_30d_canonical` split 5/5 across two WHERE-clause orderings.

And remove "literally a coin flip" (it's implied by the 5/5 split).

Flagged by: code-simplicity-reviewer (P3).

### cases.yaml contains an intentional destructive payload for SQL injection testing

**Location:** `evals/cases.yaml` (the `edge_sql_injection` case)

The eval case's `nl` field contains `"'; DROP TABLE orders; --"` as intentional test input. It's safe (never executed, grammar can't parse it into SQL), but a GitHub secret-scanner or a skimming reviewer on a public repo might flag the string out of context.

**Fix:** Add a one-line comment at the top of `evals/cases.yaml` OR directly above the `edge_sql_injection` case:
```yaml
# edge_sql_injection contains an intentional destructive payload as test
# input to exercise the CFG safety fence. The payload is never executed.
```

Flagged by: security-sentinel (P3 — optional).

## Proposed Solutions

### Option A (Recommended) — Apply both tweaks

**Pros:** ~2-minute presentation win on both shipping artifacts.
**Cons:** None.
**Effort:** Small.
**Risk:** None.

### Option B — Skip

**Pros:** Zero effort.
**Cons:** Minor presentation debt remains.

## Recommended Action

**Option A** if you're already touching the README for the P2 log dedup work. Otherwise Option B.

## Technical Details

**Affected files:** `README.md`, `evals/cases.yaml`

## Acceptance Criteria

- [ ] README "Exploration pass" section has no redundant prose/code-block/table repetition
- [ ] `cases.yaml` has a context-setting comment for the SQL injection case

## Work Log

(unstarted)
