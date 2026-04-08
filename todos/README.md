# Review findings todo ledger

Code review findings from the multi-agent review in this session. Organized by priority.

**Status convention:**
- `pending` — needs triage
- `ready` — approved, queued for fixing
- `complete` — shipped

**File naming:** `{id}-{status}-{priority}-{slug}.md`

## Current state

| ID | Priority | Status | Title |
|----|----------|--------|-------|
| 001 | p1 | pending | Pipeline + UI error handling — demo blockers |
| 002 | p1 | pending | ClickHouse local config hardening |
| 003 | p2 | pending | Trim premature eval-cases helpers and /api/cases route |
| 004 | p2 | pending | One unit test for splitInlineFlags + checkPatterns |
| 005 | p2 | pending | Preserve error cause and tighten sanitizeError classification |
| 006 | p2 | pending | /api/query input validation + length cap |
| 007 | p3 | pending | Batched code nits |

## Fix sequencing (recommended)

Before Phase 4 (Mode A reliability):
- 001 — error handling trifecta
- 002 — ClickHouse config hardening
- 004 — eval runner unit test

Before the Loom (Phase 7):
- 006 — input validation
- 005 — error propagation improvements

Defer or skip based on remaining budget:
- 003 — delete drift (or accept and move on)
- 007 — batched nits
