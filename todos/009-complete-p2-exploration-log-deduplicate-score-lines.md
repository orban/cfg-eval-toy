---
status: pending
priority: p2
issue_id: 009
tags: [code-review, simplicity, exploration-pass]
dependencies: []
---

# P2: Exploration log duplicates score info in two sections

## Problem Statement

The shipped log at `evals/exploration-pass-2026-04-08.txt` has two sections that carry overlapping information:

1. **PROGRESS section** (~22 lines) — shows `[kind] id  dots  pass/total  variants  confidence` per case
2. **PER-CASE DETAIL section** (~190 lines) — each case entry starts with three lines that restate pass/CI/variants count *before* showing the actual SQL variants

The only new information in PER-CASE DETAIL that isn't already in PROGRESS is (a) the exact CI numeric values and (b) the SQL variants themselves. The three prefix lines (`pass: X/N (Y%)`, `CI 95%: [low, high] LABEL`, `variants: N`) add ~66 lines of noise across the 22 cases without adding new information.

## Findings

### Redundant score lines in PER-CASE DETAIL

**Location:** `evals/exploration-pass-2026-04-08.txt` lines ~61-236 (per-case entries)

Each per-case entry currently looks like:

```
[canonical] sum_30h_canonical
  pass:     10/10 (100%)
  CI 95%:   [0.72, 1.00]  MED
  variants: 1
    #1 [PASS ] ×10
       SELECT sum(price) FROM orders WHERE ...
```

The first three indented lines repeat the PROGRESS section. Flagged by: code-simplicity-reviewer (P2 — biggest visible log win).

### Rough impact

Dropping the three prefix lines per case saves ~66 lines from a ~330-line artifact (~20%). The remaining content is more clearly "here is the actual SQL that came back," which is the only reason the PER-CASE DETAIL section exists.

## Proposed Solutions

### Option A (Recommended) — Collapse per-case header to one line with CI inline

Replace the four-line prefix with a single header line that keeps the CI numeric values (the one piece of info not in PROGRESS):

```
[canonical] sum_30h_canonical  10/10  CI [0.72, 1.00] MED
    #1 [PASS ] ×10
       SELECT sum(price) FROM orders WHERE ...
```

**Pros:** Keeps all information, removes redundancy, sharper focus on the SQL variants.
**Cons:** One fewer row for the eye to settle on; slightly denser.
**Effort:** Small (manual edit of the log artifact, ~5 min).
**Risk:** None.

### Option B — Drop PER-CASE DETAIL entirely, keep only PROGRESS + SUMMARY + a single appendix showing all distinct SQL variants across the run

**Pros:** Maximum compression.
**Cons:** Loses the case-to-variant mapping, which is the demo narrative hook.
**Effort:** Medium.
**Risk:** Reduces artifact usefulness for the Loom walkthrough.

### Option C — Skip

**Pros:** Zero effort.
**Cons:** Artifact is ~20% noisier than it needs to be. Worth fixing since this is what a reviewer sees.

## Recommended Action

**Option A.** Direct edit of the log file to collapse the four-line prefix into a one-line header per case.

## Technical Details

**Affected files:** `evals/exploration-pass-2026-04-08.txt`

**Approach:** Manual edit; the script itself doesn't need to change (user directive: script is not being committed).

## Acceptance Criteria

- [ ] Each per-case entry in PER-CASE DETAIL is a single header line (kind, id, pass/total, CI, confidence) followed by its variant list
- [ ] No information loss: CI numeric values still present
- [ ] Artifact total length reduced by ~60 lines
- [ ] PROGRESS and SUMMARY sections unchanged

## Work Log

(unstarted)
