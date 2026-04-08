# CFG Eval Toy — Brainstorm

**Date:** 2026-04-08
**Assignment:** [Raindrop: Context Free Grammars + Eval Toy](https://raindrop-ai.notion.site/Context-Free-Grammars-Eval-Toy-25e4163df3b480458a64eedb77b2f258)
**Status:** Design approved, ready for planning

## What we're building

A deployed web app where a user types a natural-language query ("sum the total of all orders placed in the last 30 hours") and sees results from ClickHouse. SQL generation goes through GPT-5 with a Context Free Grammar constraint so the output is parseable, scoped to one table, and restricted to a hand-picked set of operations.

Ships with 3+ evals for the NL-to-SQL pipeline, a GitHub repo, and a Loom walkthrough. Budget: ~6.5 hours of build time, 3 days to deliver.

## Why this approach

The assignment is mechanically easy. The bar isn't "did you ship the checklist" — it's "how do you think when the problem is trivial." So the strategy is:

1. **Do the baseline cleanly.** Simple UI, correct CFG, working queries, three paraphrase-grouped evals. No drama, no overbuilding.
2. **Add one sharp extension.** A reliability panel that runs a case multiple times — either the same input (stochasticity) or across paraphrases of the same intent (semantic robustness) — and reports pass rate with a Wilson confidence interval, a raw list of distinct SQL variants produced, and a small failure-mode breakdown. Before recording the Loom, explore model outputs until you have one *concrete failure to open the demo with*, or a characterized stability result.
3. **Let the Loom carry the thesis.** The reframe — *"what we call an eval is one sample from a distribution; this is the measurement apparatus, not a proof of anything"* — is the whole pitch. Don't name-drop related work; let the demo do it.

The extension is deliberately tiny. Not SPRT, not BH correction, not trajectory alignment, not an eval framework. Just: "run the same input N times, or sweep paraphrases, show what varies — and what doesn't."

**Critical framing:** the tool is *measurement*, not *proof*. If CFG + narrow grammar makes this system perfectly stable across runs, that is itself a valid result — you just found that out using a method that would have caught instability if it were there. The demo works either way. Do not bet on variance showing up.

## Hard constraints

These are non-negotiable. The planning and implementation phases MUST respect them.

1. **Mode A is required. Mode B is optional.** If anything slips, cut Mode B immediately. The core idea lands with Mode A alone. Mode B is de-risk and polish, not essential.
2. **Failure mode tagging is the first thing to degrade.** If it takes more than ~30 minutes to get working, fall back to simple string/regex checks against the expected SQL patterns. Do not build a real parser. Do not chase edge cases.
3. **No canonicalization. Show raw SQL variants with counts.** Regex-based canonicalization is on the wrong side of a tradeoff — either it's trivial (because the grammar is narrow) or it lies (because it's not a parser). Just list distinct raw SQL strings and their trial counts. Honest, cheap, no false-confidence artifacts.
4. **Demo quality > feature completeness.** If there's any tradeoff between a smoother baseline demo and a more complex reliability panel, choose the smoother demo.
5. **Explore before recording.** Before the Loom, run Mode A across the eval cases until you have either (a) one real failure to open the demo with or (b) a crisp stability result to frame. Do not outsource the narrative to whatever randomness the live demo serves up.

**Final rule:** this should feel like *boring implementation + one sharp idea*. If the plan starts to feel intellectually satisfying or too clever, it's overbuilt — back off.

## Execution fallback tree

Plan explicitly for degradation. If time pressure hits, drop levels in this order: Level 3 → Level 2 → Level 1.

**Level 1 — minimum viable (must ship):**
- Baseline app works end-to-end
- CFG-constrained SQL generation works
- ClickHouse query executes
- 3 required evals pass (single run)
- Simple Mode A repeated runs
- Pass rate only (raw fraction)

**Level 2 — strong submission (target):**
- Level 1, plus:
- Wilson CI + "Confidence: LOW/MED/HIGH" label
- Distinct raw SQL variant listing with per-variant counts

**Level 3 — nice-to-have (stretch):**
- Level 2, plus:
- Failure mode breakdown (3 labels, pattern-matched against expected SQL)
- Mode B semantic robustness sweep
- A concrete "failure + fix" beat in the Loom: show one breaking paraphrase, then show a tightened grammar or prompt killing it

## Architecture & stack

- **Next.js 15 + TypeScript**, single Vercel deploy. API routes handle OpenAI and ClickHouse calls server-side.
- **ClickHouse Cloud** (free tier) with one table: `orders`.
- **Dataset:** synthetic. A small Python script generates ~10k orders with `order_id`, `customer_id`, `order_purchase_timestamp`, `order_status`, `price`, `freight_value`, `customer_state`, `payment_type`. Timestamps are laid out so that "last 30 hours", "last week", and "last 60 days" all have meaningful answers. This gives full schema control, guaranteed-answerable queries, and no join work. Olist and other real datasets are nerd-snipes for this scope — skip them.
- **Pinned `NOW()`:** the app clamps the reference timestamp to `max(order_purchase_timestamp)` in the data (which for synthetic data is the generator's end-time). Makes "last 30 hours" deterministic for eval correctness.
- **Repo layout:**
  ```
  app/
    page.tsx              # query UI + reliability panel
    api/query/route.ts    # NL → CFG → SQL → ClickHouse → result
    api/eval/route.ts     # run N trials of an eval case
  lib/
    grammar.lark          # the CFG
    openai.ts             # GPT-5 CFG call wrapper
    clickhouse.ts         # client + query execution
    stats.ts              # Wilson score CI (~15 lines)
    evals.ts              # eval cases + runner
  evals/cases.yaml        # 3+ eval cases
  scripts/ingest.ts       # one-shot CSV → ClickHouse
  ```

## The CFG

A hand-written Lark grammar, roughly 40 rules. Covers:

- `SELECT` with aggregates (`sum`, `avg`, `count`, `min`, `max`) or bare columns or `*`
- `FROM orders` only (no joins, no subqueries)
- Enumerated column literals (no freeform identifiers)
- `WHERE` with time predicates, status predicates, state predicates, numeric predicates
- Time expressions: `now() - INTERVAL N (HOUR|DAY|WEEK|MONTH)` or ISO dates
- Enumerated `order_status` values (`'delivered'`, `'shipped'`, `'canceled'`, `'processing'`)
- Optional `GROUP BY` and `LIMIT`

The grammar does two jobs: it's a safety fence (GPT-5 cannot emit `DROP TABLE`, hallucinate columns, or join other tables) and a legibility anchor (every output is guaranteed parseable and conforms to a small known shape, so the reliability panel can pattern-match raw SQL against expected forms with simple regex — no parser needed).

**Explicitly not used:** ClickHouse's `utils/antlr/` grammar. It's ANTLR (wrong format for GPT-5 CFG, which needs Lark or regex), it's the full SQL dialect (defeats the safety-fence purpose), and it's unsupported by ClickHouse themselves ("kept for curiosity"). It's a useful cheat sheet for `INTERVAL` and date syntax, nothing more.

## Baseline pipeline

`POST /api/query`:

1. Receive NL query from the client.
2. Call GPT-5 Responses API with a system prompt describing the `orders` schema plus the CFG tool constraint.
3. Extract SQL from the grammar-constrained response.
4. Execute against ClickHouse Cloud.
5. Return `{ sql, rows, elapsed_ms, stage }` where `stage` is `'ok' | 'grammar_fail' | 'exec_fail'`. An empty result set is still `'ok'`. `result_mismatch` is an eval-only concept and does not appear here.

UI is one page: a text input, a generated-SQL block, a small results table, a dropdown of example queries. No auth, no history, no routing.

## The three baseline evals

**Vocabulary:**
- **Intent** — the semantic meaning (e.g. "sum in 30h window").
- **Case** — one (intent, NL phrasing) pair. The unit that gets run.
- **Trial** — one execution of a case through the NL → CFG → SQL → ClickHouse → check pipeline.
- **Paraphrase** — an alternate NL phrasing of the same intent. Each paraphrase is its own case.

The three required baseline evals are three intents, one canonical case each:

| # | Intent | Canonical case |
|---|---|---|
| 1 | Sum in time window | "sum the total of all orders placed in the last 30 hours" |
| 2 | Filtered count | "how many orders were canceled last week" |
| 3 | Group-by with time | "average price per state for orders in the last 60 days" |

Each case in `evals/cases.yaml` specifies:
- `expected_patterns` — a list of regex assertions on the generated SQL that must all match for a pass. Each pattern is a named check (e.g. `time_predicate: ">= now\\(\\) - \\d+ hour"`). These double as input to the failure-mode tagger.
- `expected_result` — a scalar or small row set (deterministic because `NOW()` is pinned)
- `pass_criteria` — `grammar_parse && sql_executes && all_patterns_match && result_matches`

Paraphrase cases live in the same file under each intent. They are not part of the baseline "3 evals passed" count but are selectable in the reliability panel's dropdown. Roughly 4-5 paraphrases per intent, so ~15 cases total.

## The reliability extension

A panel below the baseline UI. It has two modes, exposed as a radio selector:

- **Mode A — Stochasticity:** fixed NL input, N trials. Measures model variance on identical input. Answer to the question *"does the same question always give the same answer?"*
- **Mode B — Semantic robustness:** same intent, sweep across all paraphrase cases, M trials each. Measures how wording perturbations change behavior. Answer to the question *"do trivially equivalent questions give equivalent answers?"*

Both modes share one backend: the API route accepts a list of `(case_id, trials)` tuples and executes them serially. Mode A sends `[(canonical_case, N)]`; Mode B sends `[(para_1, M), (para_2, M), ...]`. Reporting structure is the same.

**Why two modes:** they are different axes of failure, and keeping them separate in the UI keeps the thesis legible. Mixing them is the most common sin in eval reporting — "80% pass rate" that's actually averaging stochasticity variance with semantic-robustness variance tells you nothing about either.

**What the harness reports for each run:**

- **Pass rate with 95% Wilson score CI.** Wilson is the right default at low n because it's well-behaved at p=0 and p=1, unlike the normal approximation. Paired with an explicit "Confidence: low / medium / high" label based on interval width — don't trust reviewers to read the CI bounds.
- **Distinct raw SQL variants with counts.** Group trials by exact generated SQL string (not canonicalized — see Hard constraint #3). Display each distinct variant once with its trial count. If two variants differ only in whitespace, they're listed separately and that's fine. Honest over elegant.
- **Failure mode breakdown.** Three labels max, presented as *systematic failure modes* not as *bugs that happened*: `wrong_comparison_direction`, `wrong_time_unit`, `missing_filter`. Tagging is ~30 lines of pattern matching against the case's `expected_patterns` — no real SQL parser, no LLM judge. For each failed trial, check which expected pattern didn't match and map to a label. Everything that doesn't fit: `other`.

Output format (cribbed from Cerberus's CLI output):

```
Case: sum in 30h window  |  Mode: stochasticity (10 trials of same input)
  PASS  80.0% [CI: 44–97%]  (10 trials)
  Confidence: LOW — n=10 is not enough to commit to a reliability claim

  Distinct SQL variants: 2
    ✓  8×  SELECT sum(price) FROM orders
           WHERE order_purchase_timestamp >= now() - INTERVAL 30 HOUR
    ✗  2×  SELECT sum(price) FROM orders
           WHERE order_purchase_timestamp <= now() - INTERVAL 30 HOUR
           └─ wrong_comparison_direction (expected >=)

  Systematic failure modes observed:
    wrong_comparison_direction   2  (20%)
```

And the other mode:

```
Intent: sum in 30h window  |  Mode: semantic robustness (5 paraphrases × 3 trials each)
  PASS  86.7% [CI: 62–96%]  (15 trials across 5 paraphrases)
  Confidence: LOW — n=15 and cross-paraphrase variance present

  Per-paraphrase:
    ✓ 3/3  "sum the total of all orders placed in the last 30 hours"
    ✓ 3/3  "what's the total order amount from the last 30 hours"
    ✗ 1/3  "add up order volume over the past 30 hours"
           └─ 2× wrong_time_unit (30 DAY instead of 30 HOUR)
    ✓ 3/3  "sum all orders in the last 30 hrs"
    ✓ 3/3  "total of orders from the previous 30 hours"
```

**Handling both outcomes:** if Mode A returns 10/10 identical runs, the output says *"Stable: 1 distinct variant, 100% pass"* and the Loom narrative is *"in this constrained setup the system was stable — which is exactly what you want, but you only know that because you measured it."* If Mode A shows variance, the Loom narrative is *"here's what it caught, and this is what would otherwise leak into production as intermittent failures."* Either outcome works. The pitch is the measurement apparatus, not the variance itself. **But don't leave the outcome to chance — do the exploration pass before recording.**

## Non-goals

- No SPRT early stopping
- No Benjamini-Hochberg correction
- No trajectory alignment or divergence analysis
- No LLM-judge scoring
- No parallel eval execution
- No multi-table support, no joins
- No authentication, no user accounts, no query history
- No CLI tool separate from the app
- No chart library (text output is enough)

## Time budget

- **~2.5h:** Scaffold Next.js, synthetic dataset generator, ClickHouse Cloud setup + schema + ingest, baseline CFG grammar, first end-to-end query working, simple query UI.
- **~2h:** Reliability panel — API route, Wilson port, raw variant listing, failure tagger, Mode A. Mode B if time permits.
- **~1h:** Pre-Loom exploration pass — run Mode A across all cases, find a concrete failure or characterize stability, prepare the demo around a known outcome.
- **~1h:** Polish + Loom recording.

**Total:** ~6.5 hours, right at the budget. No slack. The most likely overrun points: GPT-5 CFG tool API gotchas (bank on 30 min of "why isn't this grammar accepted") and the failure-mode tagger getting gnarly. See the **Execution fallback tree** above — drop levels, don't try to cram.

## Planning guidance

Rules for the planning and implementation phases:

- **Front-load the risky parts.** The CFG + OpenAI call and the ClickHouse ingest should both be de-risked in the first work session. If either is broken, everything else is blocked.
- **Product story before meta-story.** The first hour of implementation goes to getting a clean, semantically honest baseline end-to-end. If the baseline feels like a polished toy, no amount of reliability panel saves it.
- **Don't design the failure tagger until you see real outputs.** The three labels are a guess. The actual model outputs will tell you what categories to keep and what to drop. Build the harness first, look at ~20 sample outputs, then write the tagger against what you see.
- **If the CFG tool API is annoying, simplify the grammar before debugging SDK issues.** The smaller the grammar, the lower the blast radius of any CFG-specific quirk.
- **Exploration pass is a named phase, not a polish task.** Before recording the Loom, spend a fixed block running Mode A across cases to surface a concrete failure (or characterize stability). Do not record blind.

## Loom structure

Target 5 minutes, hard cap 6. **Open with the specific finding, not the discovery.** Structure depends on what the pre-Loom exploration pass surfaces. Two paths:

### Path A — exploration surfaced a concrete failure

This is the stronger path. Open cold on the failure, then contextualize.

1. **The failure** (30s). Show a paraphrase that looks trivially equivalent to a passing case but breaks. *"Look at this. Same intent, slightly different phrasing. The first passes, the second doesn't — and the baseline eval never would have caught it."*
2. **What the app is** (45s). Back up. Here's the prompt, here's the CFG, here's ClickHouse. A baseline query works. The three required evals pass. Fast, no ceremony.
3. **How we know the failure exists** (60s). The reliability panel. Mode A or Mode B — whichever caught it. Walk through the Wilson CI, the variant counts, the failure-mode tag. Land on: *"single-run evals collapse a distribution into one sample; if you only sampled once, you'd ship this."*
4. **The production line** (15s), verbatim: *"If this were in a production system, these kinds of differences are what show up as intermittent failures that are very hard to debug from a single trace."*
5. **Optional — the fix** (30s). If there's time, show one small change (tighter grammar rule, tighter prompt, added eval case) that kills the failure. *"Measuring something lets you act on it."*
6. **Close** (20s): *"The point isn't that this system is unreliable — it's that I wouldn't have known either way without measuring. This is where I've been thinking more broadly."*

### Path B — exploration showed stability across the board

Fall back to the measurement-is-the-point framing.

1. **Baseline demo** (30s). NL → SQL → results. Fast.
2. **Three evals green** (20s). No ceremony.
3. **"But does it actually work?"** (20s). *"What we call an eval is usually one sample from a distribution. Let's actually sample it."*
4. **The reliability run** (60s). Mode A, 10 trials. Show the result — likely 1 distinct variant, 100% pass. *"In this constrained setup it's stable — and that is exactly what you want, but you only know it because you measured it."* Point at the Wilson CI: *"and even at 100%, the CI says I wouldn't stake a production claim on n=10 alone."*
5. **The production line** (15s), verbatim: *"If this were in a production system, these kinds of differences are what show up as intermittent failures that are very hard to debug from a single trace."*
6. **Machinery** (60s). Grammar file, cases.yaml, brief Mode B walkthrough. Why CFG, why Wilson, why two modes.
7. **Close** (25s): *"Single-run eval reports collapse a distribution into one sample. This is the minimum viable measurement for telling the difference. This is where I've been thinking more broadly."*

### Do / don't

- **Do not** name Moirai or Cerberus in the recording. They earn their place in Q&A.
- **Do not** use the phrase "eval hygiene" — it makes the thesis sound like a checklist instead of a capability.
- **Do not** explain what variant counting is *for* — just show it.
- **Do** know which path you're taking before you hit record. Pick based on the exploration pass, not mid-demo.
- **Do** have the specific failing paraphrase (Path A) or the specific stable intent (Path B) queued up and ready to click.

## Open questions

- **How to ingest to ClickHouse Cloud fastest:** direct `INSERT` from script vs the web UI's upload. For ~10k synthetic rows, script is simplest.
- **Which GPT-5 endpoint for CFG:** confirm whether the CFG tool is available via `openai` Node SDK or needs a raw `fetch` to the Responses API. Low risk; handled in planning.
- **Loom recording tool:** Loom itself, or `cap`, or `rerun`. Not design-relevant, pick during polish.
