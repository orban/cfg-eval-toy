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
| 001 | p1 | complete | Pipeline + UI error handling — demo blockers |
| 002 | p1 | complete | ClickHouse local config hardening |
| 003 | p2 | complete | Trim premature eval-cases helpers and /api/cases route |
| 004 | p2 | complete | One unit test for splitInlineFlags + checkPatterns |
| 005 | p2 | complete | Preserve error cause and tighten sanitizeError classification |
| 006 | p2 | complete | /api/query input validation + length cap |
| 007 | p3 | pending | Batched code nits |

All P1 and P2 findings resolved before Phase 4. P3 nits batched for optional cleanup in Phase 6.
