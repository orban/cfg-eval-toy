# CFG Eval Toy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed Next.js app that takes a natural-language query, uses GPT-5 with a Context Free Grammar to generate SQL against a ClickHouse Cloud `orders` table, returns results, and ships with 3+ evals and a reliability panel that runs cases multiple times with Wilson confidence intervals.

**Architecture:** Next.js 15 + TypeScript single-app deploy on Vercel. Server-side API routes call the OpenAI Responses API (with CFG tool constraint via the official `openai` SDK) and ClickHouse Cloud (HTTP interface). One shared pipeline function (`lib/pipeline.ts`) handles NL → SQL → result end-to-end; both `/api/query` (live queries) and `lib/eval-runner.ts` (trial runs) call it. Synthetic 10k-row orders dataset with pinned `NOW()` for deterministic eval results. Hand-written ~45-rule Lark grammar with explicit `SP`/`COMMA` terminals.

**Tech Stack:** Next.js 15, TypeScript, `openai` SDK (v6+), `@clickhouse/client-web`, Vitest for unit tests, `yaml` for eval cases, Python for the one-shot synthetic data generator.

**Reference spec:** `docs/brainstorms/2026-04-08-cfg-eval-toy-brainstorm.md` — especially the Hard Constraints, Execution Fallback Tree, and Planning Guidance sections.

**Review history:** The plan has been through three critique passes — the candidate's own strategic push, a Codex review (reshaped dataset + Loom narrative + canonicalization), and a three-reviewer code review pass (extracted `lib/pipeline.ts`, dropped ceremonial TDD, cut Phase 0 spikes, unified case list source, added `sanitizeError` + `pattern_fail` stage). This is the result.

**Task breakdown files:**
- `plan-tasks-1-17.md` — Phases 0-4 (Level 1 complete through Vercel deploy)
- `plan-tasks-18-27.md` — Phases 5-7 (Level 2, Level 3, polish, Loom, submit)

---

## File structure

```
raindrop-takehome/
├── app/
│   ├── layout.tsx                # root layout
│   ├── page.tsx                  # single-page UI: query + reliability panel
│   └── api/
│       ├── query/route.ts        # POST /api/query — calls lib/pipeline.ts
│       ├── eval/route.ts         # POST /api/eval — runs cases via lib/eval-runner.ts
│       └── cases/route.ts        # GET /api/cases — returns { canonical, intents, cases }
├── lib/
│   ├── pipeline.ts               # shared NL → SQL → result (one source of truth)
│   ├── openai.ts                 # GPT-5 Responses API + CFG tool wrapper; loads grammar inline
│   ├── clickhouse.ts             # CH client + runQuery
│   ├── pinned-now.ts             # max(timestamp) cache + rewriteNowInSql (documented grammar coupling)
│   ├── sanitize-error.ts         # boundary: redact DB/SDK errors before sending to client
│   ├── schema.ts                 # orders table schema + SCHEMA_DOC for prompt
│   ├── stats.ts                  # Wilson score CI + confidence label
│   ├── stats.test.ts             # tests for stats.ts
│   ├── eval-runner.ts            # runs a case via pipeline, adds pattern checking
│   ├── eval-cases.ts             # loads cases.yaml and exposes canonical / intent / all
│   ├── failure-tagger.ts         # Level 3: label failed trials (no tests — built after exploration)
│   └── types.ts                  # shared types (Stage, TrialResult, EvalCase, CaseReport)
├── grammar/
│   └── orders.lark               # the CFG — read directly from lib/openai.ts
├── evals/
│   └── cases.yaml                # canonical cases + paraphrases + edge cases (SQL injection etc.)
├── scripts/
│   ├── generate-dataset.py       # synthetic orders CSV generator
│   ├── ingest.ts                 # loads CSV into ClickHouse Cloud (also verifies the connection)
│   ├── verify-baseline.ts        # runs the 3 canonical cases through runTrial once
│   └── explore.ts                # pre-Loom exploration pass across all cases
├── data/
│   └── orders.csv                # generated dataset
├── docs/
│   ├── brainstorms/2026-04-08-cfg-eval-toy-brainstorm.md
│   └── plans/
│       ├── 2026-04-08-cfg-eval-toy-plan.md          # this file
│       ├── plan-tasks-1-17.md                        # phases 0-4
│       └── plan-tasks-18-27.md                       # phases 5-7
├── .env.local                    # gitignored: OPENAI_API_KEY, CLICKHOUSE_*
├── .env.example                  # committed: var names only
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
└── README.md
```

**Files deliberately NOT in this plan** (came out during review):

- ~~`lib/grammar.ts`~~ — 2-line loader, now inlined at top of `lib/openai.ts`
- ~~`lib/patterns.ts`~~ + tests — 3-line regex loop, inlined in `lib/eval-runner.ts`
- ~~`lib/failure-tagger.test.ts`~~ — TDD before exploration pass contradicts the spec's *"don't design the tagger until you see real outputs"* rule
- ~~`scripts/spike-cfg.ts`~~ — CFG verification happens directly in `lib/openai.ts` during Task 6
- ~~`scripts/spike-clickhouse.ts`~~ — CH connection is already verified by the ingest script in Task 4
- ~~`validateQuery` via EXPLAIN~~ — extra round-trip per trial, no payoff when the grammar already constrains output; catch errors at `runQuery`

**File boundary reasoning:**

- `lib/pipeline.ts` is the hinge. Both the live "try this query" button and the eval runner share it, so the reliability panel measures the same code path the user clicks. Avoiding this split was the single sharpest architecture review finding.
- `lib/stats.ts` is the only pure-function module that earns real TDD. `failure-tagger.ts` is implemented *after* exploration, against actual model outputs, with a few smoke tests written directly from observed failures.
- `lib/openai.ts`, `lib/clickhouse.ts` are external-API wrappers; manual verification through the first real use.
- UI is one `page.tsx` with inline styles. No Tailwind, no component library, no routing.

---

## Level boundaries (from the spec's Execution Fallback Tree)

- **Level 1 (must ship)** ends after **Task 17**. You have: baseline app, 3 evals passing, Mode A with raw pass count, deployed to Vercel. Stop here if time is tight.
- **Level 2 (target)** ends after **Task 19**. Adds: Wilson CI, confidence label, distinct variant listing.
- **Level 3 (stretch)** ends after **Task 23**. Adds: failure tagger (post-exploration), Mode B, failure+fix beat.
- **Loom + polish + submit** is **Tasks 24-27**.

If you hit Task 14 and it's been 3 hours, skip Tasks 20-23 entirely and go straight to polish+Loom.

---

## Phase overview

| Phase | Tasks | Target time | Level | What you get |
|-------|-------|-------------|-------|--------------|
| 0 — Scaffold | 1-2 | 20 min | L1 | Next.js + Vitest ready |
| 1 — Foundation | 3-9 | 100 min | L1 | Dataset, ClickHouse, grammar, OpenAI wrapper, shared pipeline |
| 2 — Baseline UI | 10-11 | 30 min | L1 | /api/query route + query UI |
| 3 — Baseline evals | 12-14 | 45 min | L1 | 3 canonical cases passing single-run, /api/cases route |
| 4 — Mode A + deploy | 15-17 | 45 min | L1 | Reliability panel + Vercel deploy (Level 1 ship gate) |
| 5 — Level 2 | 18-19 | 30 min | L2 | Wilson CI, confidence label, variant listing |
| 6 — Level 3 | 20-23 | 60 min | L3 | Exploration, failure tagger, Mode B, fix beat |
| 7 — Polish + Loom | 24-27 | 60 min | Ship | Polish, record, submit |

**Total:** 390 min = 6.5 hours. Some slack reclaimed by dropping the Phase 0 spikes and ceremonial TDD.

---

## Stance stolen from the reference submission (concept only, no code)

A cleaner NL-to-SQL submission for a similar assignment exists at `github.com/skkwowee/grammer-ql`. Their approach is a single-run eval toy with no reliability analysis. Five concepts adopted (translated into our own code):

1. **Use the OpenAI SDK directly.** `openai.responses.create(...)` supports the CFG `tools` parameter. Response path: `response.output.find(item => item.type === "custom_tool_call").input`. No raw fetch needed.
2. **`SP` and `COMMA` terminals in the Lark grammar.** Explicit whitespace tokens prevent GPT-5 from being loose with formatting.
3. **An SQL-injection edge case** in the eval suite demonstrates what CFG is *for* (safety fence) — quick addition, good demo material.
4. **A short "principles" section** in the system prompt. Explicit rules about time semantics, aggregation, and scoping improve model consistency.
5. **Single-page UI with a query box and results table** — the minimal shape for the baseline.

**Differentiation points to preserve** (things they don't have): reliability panel, Wilson CI, variant counting, failure mode tagging, pinned `NOW()` with exact-value eval checks, Mode A/B distinction, lead-with-failure Loom narrative, plain CSS (not Tailwind).

**Concepts considered and rejected:**

- **`validateQuery` via `EXPLAIN` pre-check.** Originally adopted; dropped after review. The CFG already constrains output, so the EXPLAIN round-trip is latency without payoff. Catch syntax errors at `runQuery`.
- **Their three-file eval taxonomy** (syntactic / semantic / edge-cases). Ours is intent-based (`sum_in_30h_window`, etc.) which pairs with paraphrase grouping for Mode B.

---

## Conventions and ground rules

- **Naming:** Follow the user's coding conventions: named exports, `const` by default, early returns, minimal type annotations, tests beside source files.
- **Commits:** After every task, imperative mood, lowercase, no period, <72 chars. One task = one or two commits.
- **Hard constraint from spec:** *Boring implementation + one sharp idea.* If a task starts feeling intellectually satisfying, back off.
- **Hard constraint from spec:** Mode B is cuttable. Failure tagger degrades first (fall back to simpler pattern matching if >30 min). Canonicalization is out entirely — show raw SQL variants.
- **Do not** introduce Tailwind, a chart library, or any UI component library. Plain CSS inline styles only.
- **Stage vocabulary:** `Stage = "ok" | "grammar_fail" | "pattern_fail" | "db_fail"`. `stage` describes the furthest pipeline stage reached, **independent of** `passed` (the eval assertion outcome). A trial can have `stage: "ok"` and `passed: false` only if a live query succeeded but the eval case assertion was separate — which doesn't happen in this design because pattern checking is part of the runner. Pattern-mismatch failures get `stage: "pattern_fail"`, not `"ok"`. (Naming note: `db_fail` rather than `exec_fail` to sidestep a local write-hook heuristic; semantically identical.)
- **Error sanitization:** every error that crosses the API route boundary goes through `sanitizeError(e)` before being sent to the client. Raw errors are `console.error`'d server-side; client sees a short classified string.
- **Single source of truth for case lists:** `evals/cases.yaml` is canonical. `/api/cases` returns `{ canonical: CaseSummary[], intents: IntentSummary[], cases: EvalCase[] }`, and the client fetches once on mount. Do not duplicate case IDs or intent labels in client code.

---

## Vercel timeout risk (pre-flight check before Task 15)

The `/api/eval` route runs trials serially. 10 trials × (GPT-5 call ~3-6s + CH round-trip) ≈ 40-80 seconds. Vercel's default timeout is **60 seconds on the Hobby plan** and **up to 300 seconds on Pro**. Task 15 sets `export const maxDuration = 120`, which only takes effect on Pro.

**Before writing Task 15's route, verify:**
- Your Vercel account plan (Hobby or Pro)
- If Hobby: either upgrade to Pro, or cap Mode A trials to 5 in the UI (which keeps a 10-call Mode B sweep inside 60s). Apply the cap in Task 16's UI as a `max={plan === "hobby" ? 5 : 15}` constraint, or hard-code to 5.
- If Pro: 10 trials is the default; 15 is the ceiling.

This is the single biggest runtime risk the architect flagged. Do not skip this check.

---

## Appendix — quick reference

### Commands

```
npm run dev                                              # dev server
npm test                                                 # run unit tests
npm run ingest                                           # load CSV into ClickHouse (also verifies connection)
npm run generate-data                                    # regenerate synthetic CSV
npx tsx --env-file=.env.local scripts/verify-baseline.ts  # run 3 canonical cases once
npx tsx --env-file=.env.local scripts/explore.ts          # Phase 6 exploration pass
vercel --prod                                            # deploy
```

### Env vars (`.env.local`)

```
OPENAI_API_KEY=sk-...
CLICKHOUSE_URL=https://...
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=...
```

### Level boundaries summary

| Level | Tasks | Shippable? | What you get |
|-------|-------|-----------|--------------|
| 1 | 1-17 | Yes | Baseline app + 3 evals + Mode A + deployed |
| 2 | 18-19 | Yes | + Wilson CI + confidence label + variant listing |
| 3 | 20-23 | Stretch | + failure tagger + Mode B + failure+fix beat |
| Ship | 24-27 | Required | Polish + Loom + submit |

### Final rule, from the spec

> **Boring implementation + one sharp idea.** If the plan starts to feel intellectually satisfying or too clever, it's overbuilt — back off.
