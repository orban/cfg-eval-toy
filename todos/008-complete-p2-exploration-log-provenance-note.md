---
status: pending
priority: p2
issue_id: 008
tags: [code-review, quality, documentation, exploration-pass]
dependencies: []
---

# P2: Exploration log lacks provenance note

## Problem Statement

`evals/exploration-pass-2026-04-08.txt` is presented as the output of `scripts/exploration-pass.ts`, but it was hand-reformatted for readability: the "Wall clock: 1141.2s" header, the "Headline" summary bullets, and the final `VERDICT: Loom Path B+ ...` line are editorial additions that do NOT match any string the script actually prints (the script prints `VERDICT HINT: no failures, but syntactic drift present` / `→ Path B with a middle-ground mention`). A reviewer who runs the script to reproduce the result will see different output than what's in the log and may wonder what else was edited.

The underlying numbers — pass counts, Wilson CIs, distinct SQL variants, per-case data — are verbatim from the actual run. Only the presentation was touched.

## Findings

### Provenance gap between shipped log and raw script output

**Location:** `evals/exploration-pass-2026-04-08.txt` top header and bottom VERDICT line

The shipped log has a narrative preamble and an editorial verdict that don't appear in the script's stdout. This is honest presentation polish, but the log doesn't SAY it's been reformatted, so a careful reviewer could flag it. Flagged by: silent-failure-hunter (P2 — provenance concern).

## Proposed Solutions

### Option A (Recommended) — Add a one-paragraph provenance note at the top of the log

Insert 3-4 lines near the top of `evals/exploration-pass-2026-04-08.txt` explicitly stating:
- This is a reformatted presentation of `scripts/exploration-pass.ts` stdout
- Pass counts, SQL variants, and numeric data are verbatim from the run
- Section headers, the "Headline" bullets, and the verdict framing are editorial

**Pros:** Pre-empts the "was this doctored?" question. 30-second edit.
**Cons:** Minor additional text in the artifact.
**Effort:** Small.
**Risk:** None.

### Option B — Restore literal script verdict strings and drop the editorial framing

Revert the VERDICT line to match the script output verbatim: `VERDICT HINT: no failures, but syntactic drift present / → Path B with a middle-ground mention`. Remove the "Headline" bullets.

**Pros:** Fully faithful reproduction.
**Cons:** Loses the editorial framing that makes the artifact useful as a standalone document. Less polished.
**Effort:** Small.
**Risk:** None.

### Option C — Skip

**Pros:** Saves 30 seconds.
**Cons:** Provenance gap remains. Unlikely to be noticed, but if it is, looks sloppy.

## Recommended Action

**Option A.** The editorial framing genuinely helps the artifact stand alone. A short provenance note closes the honesty gap without sacrificing the framing.

## Technical Details

**Affected files:** `evals/exploration-pass-2026-04-08.txt`

## Acceptance Criteria

- [ ] Log artifact contains a note (≤5 lines, near the top) stating it is a reformatted presentation of raw script output with verbatim underlying data
- [ ] A reviewer reading the log understands which content is script stdout and which is editorial

## Work Log

(unstarted)
