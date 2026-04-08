# CFG Eval Toy Plan — Tasks 1-17 (Level 1 complete)

**Parent plan:** `2026-04-08-cfg-eval-toy-plan.md`

This file covers Phases 0-4: scaffold, dataset + foundation, baseline UI, baseline evals, Mode A + Vercel deploy. At the end of Task 17, Level 1 is shippable.

**Key architectural moves** (from the review pass):
- `lib/pipeline.ts` is the shared NL → SQL → result function. Both `/api/query` and `lib/eval-runner.ts` call it. One source of truth.
- `lib/sanitize-error.ts` sanitizes every error that crosses the API boundary.
- `/api/cases` returns `{ canonical, intents, cases }` — client fetches once, no duplicated case lists.
- `Stage = "ok" | "grammar_fail" | "pattern_fail" | "db_fail"` — stage is independent of `passed`.
- No Phase 0 spike scripts. CFG verification happens inside `lib/openai.ts`; ClickHouse verification happens inside the ingest script.

---

# Phase 0 — Scaffold (~20 min)

## Task 1: Bootstrap Next.js 15 + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.env.example`

**Goal:** Next.js running with a placeholder page, and the env template committed.

- [ ] **Step 1: Initialize package and install Next/React/OpenAI/ClickHouse/YAML**

```
npm init -y
npm install next@latest react@latest react-dom@latest openai @clickhouse/client-web yaml
npm install --save-dev typescript @types/react @types/react-dom @types/node tsx
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Edit `package.json` scripts**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "ingest": "tsx --env-file=.env.local scripts/ingest.ts",
    "generate-data": "python scripts/generate-dataset.py"
  }
}
```

Create `next.config.ts`:
```ts
import type { NextConfig } from "next";
const config: NextConfig = {};
export default config;
```

- [ ] **Step 4: Create bare app shell**

`app/layout.tsx`:
```tsx
export const metadata = { title: "CFG Eval Toy" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        {children}
      </body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main>
      <h1>CFG Eval Toy</h1>
      <p>Placeholder — real UI in Task 11.</p>
    </main>
  );
}
```

- [ ] **Step 5: Create `.gitignore` and `.env.example`**

`.gitignore`:
```
node_modules/
.next/
.env.local
.env*.local
*.log
.DS_Store
dist/
.vercel
exploration-log.md
```

`.env.example`:
```
OPENAI_API_KEY=sk-...
CLICKHOUSE_URL=https://your-host.clickhouse.cloud:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
```

- [ ] **Step 6: Create `.env.local` with real credentials**

Go to `clickhouse.cloud`, sign up (free tier), create a Development service, copy host/username/password into `.env.local`. Add your `OPENAI_API_KEY` too.

- [ ] **Step 7: Verify dev server runs**

```
npm run dev
```

Expected: `▲ Next.js 15.x` at `localhost:3000`. Ctrl+C to stop.

- [ ] **Step 8: Commit**

```
git add package.json package-lock.json tsconfig.json next.config.ts app/ .gitignore .env.example
git commit -m "scaffold next.js 15 app"
```

---

## Task 2: Add Vitest

**Files:** Create `vitest.config.ts`

- [ ] **Step 1: Install**

```
npm install --save-dev vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Verify**

```
npm test
```

Expected: `No test files found` or similar.

- [ ] **Step 4: Commit**

```
git add vitest.config.ts package.json package-lock.json
git commit -m "add vitest"
```

---

# Phase 1 — Foundation (~100 min)

## Task 3: Synthetic dataset generator

**Files:** Create `scripts/generate-dataset.py`, `data/orders.csv`

**Goal:** 10k synthetic orders rows with deterministic timestamps so "last 30 hours", "last week", and "last 60 days" queries all have meaningful answers.

- [ ] **Step 1: Write the generator**

```python
# scripts/generate-dataset.py
# Run: python scripts/generate-dataset.py

import csv
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

N_ROWS = 10_000
END = datetime(2026, 4, 7, 18, 0, 0)
START = END - timedelta(days=90)

STATUSES = [("delivered", 0.70), ("shipped", 0.15), ("canceled", 0.10), ("processing", 0.05)]
STATES = ["CA", "NY", "TX", "FL", "WA", "IL", "OR", "MA", "CO", "AZ"]
PAYMENTS = [("credit_card", 0.60), ("debit_card", 0.25), ("boleto", 0.10), ("voucher", 0.05)]


def weighted(choices):
    total = random.random()
    cum = 0.0
    for value, weight in choices:
        cum += weight
        if total <= cum:
            return value
    return choices[-1][0]


def skewed_timestamp():
    r = random.random()
    if r < 0.30:
        delta = timedelta(days=7 * random.random())
    elif r < 0.90:
        delta = timedelta(days=7 + 53 * random.random())
    else:
        delta = timedelta(days=60 + 30 * random.random())
    return END - delta


rows = []
for _ in range(N_ROWS):
    ts = skewed_timestamp()
    price = round(random.lognormvariate(3.5, 0.8), 2)
    price = min(max(price, 5.0), 500.0)
    freight = round(price * random.uniform(0.05, 0.20), 2)
    rows.append({
        "order_id": str(uuid.uuid4()),
        "customer_id": random.randint(1, 2000),
        "order_purchase_timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
        "order_status": weighted(STATUSES),
        "price": price,
        "freight_value": freight,
        "customer_state": random.choice(STATES),
        "payment_type": weighted(PAYMENTS),
    })

rows.sort(key=lambda r: r["order_purchase_timestamp"])

out = Path("data/orders.csv")
out.parent.mkdir(exist_ok=True)
with out.open("w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {out}")
```

- [ ] **Step 2: Run it**

```
python scripts/generate-dataset.py
```

- [ ] **Step 3: Commit**

```
git add scripts/generate-dataset.py data/orders.csv
git commit -m "add synthetic orders dataset"
```

---

## Task 4: Schema + ingest script (also verifies ClickHouse)

**Files:** Create `lib/schema.ts`, `scripts/ingest.ts`

**Goal:** Single source of truth for the schema. Ingest script creates the table, loads the CSV, verifies the row count. This doubles as the ClickHouse connectivity check — no separate spike needed.

- [ ] **Step 1: Create `lib/schema.ts`**

```ts
// lib/schema.ts
// Single source of truth for the orders table.

export const ORDERS_TABLE = "orders";

export const CREATE_ORDERS_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  order_id String,
  customer_id UInt32,
  order_purchase_timestamp DateTime,
  order_status String,
  price Float64,
  freight_value Float64,
  customer_state String,
  payment_type String
) ENGINE = MergeTree()
ORDER BY order_purchase_timestamp
`;

// Used in OpenAI system prompt.
export const SCHEMA_DOC = `
Table: orders
Columns:
  order_id (String) — unique order identifier
  customer_id (UInt32) — customer who placed the order
  order_purchase_timestamp (DateTime) — when the order was placed
  order_status (String) — one of 'delivered', 'shipped', 'canceled', 'processing'
  price (Float64) — order price in USD
  freight_value (Float64) — shipping cost in USD
  customer_state (String) — 2-letter US state code
  payment_type (String) — one of 'credit_card', 'debit_card', 'boleto', 'voucher'
`.trim();
```

- [ ] **Step 2: Create `scripts/ingest.ts`**

```ts
// scripts/ingest.ts
// Run: npm run ingest

import { createClient } from "@clickhouse/client-web";
import { readFileSync } from "fs";
import { CREATE_ORDERS_SQL, ORDERS_TABLE } from "../lib/schema";

const client = createClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
});

async function main() {
  console.log("Verifying connection...");
  const version = await client.query({ query: "SELECT version()", format: "JSONEachRow" });
  console.log("ClickHouse version:", await version.json());

  console.log("Creating table...");
  await client.command({ query: CREATE_ORDERS_SQL });

  console.log("Truncating table...");
  await client.command({ query: `TRUNCATE TABLE ${ORDERS_TABLE}` });

  console.log("Reading CSV...");
  const csv = readFileSync("data/orders.csv", "utf-8");
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, unknown> = {};
    for (let i = 0; i < header.length; i++) {
      const col = header[i];
      const val = values[i];
      if (col === "customer_id") row[col] = parseInt(val, 10);
      else if (col === "price" || col === "freight_value") row[col] = parseFloat(val);
      else row[col] = val;
    }
    return row;
  });

  console.log(`Inserting ${rows.length} rows...`);
  await client.insert({ table: ORDERS_TABLE, values: rows, format: "JSONEachRow" });

  const countResult = await client.query({
    query: `SELECT count() AS n FROM ${ORDERS_TABLE}`,
    format: "JSONEachRow",
  });
  const count = (await countResult.json()) as { n: string }[];
  console.log(`Rows in table: ${count[0].n}`);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run it**

```
npm run ingest
```

Expected: `ClickHouse version: [...]` then `Rows in table: 10000`. If this fails, ClickHouse setup is broken — fix before proceeding.

- [ ] **Step 4: Commit**

```
git add lib/schema.ts scripts/ingest.ts
git commit -m "add clickhouse schema and ingest"
```

---

## Task 5: Write the Lark grammar

**Files:** Create `grammar/orders.lark`

- [ ] **Step 1: Write `grammar/orders.lark`**

```lark
start: select_stmt

SP: " "
COMMA: ","

select_stmt: "SELECT" SP select_list SP "FROM" SP "orders" (SP where_clause)? (SP group_by_clause)? (SP limit_clause)?

select_list: select_item (COMMA SP select_item)*
select_item: aggregate | column | "*"

aggregate: AGG_FN "(" agg_arg ")"
AGG_FN: "sum" | "avg" | "count" | "min" | "max"
agg_arg: column | "*"

column: "order_id" | "customer_id" | "order_purchase_timestamp" | "order_status" | "price" | "freight_value" | "customer_state" | "payment_type"

where_clause: "WHERE" SP condition (SP LOGIC_OP SP condition)*
LOGIC_OP: "AND" | "OR"

condition: time_predicate | status_predicate | state_predicate | payment_predicate | numeric_predicate

time_predicate: "order_purchase_timestamp" SP CMP SP time_expr
CMP: ">=" | "<=" | ">" | "<" | "="

time_expr: "now()" SP "-" SP "INTERVAL" SP INT SP INTERVAL_UNIT
INTERVAL_UNIT: "HOUR" | "DAY" | "WEEK" | "MONTH"

status_predicate: "order_status" SP EQ SP status_value
EQ: "=" | "!="
status_value: "'delivered'" | "'shipped'" | "'canceled'" | "'processing'"

state_predicate: "customer_state" SP EQ SP state_value
state_value: "'CA'" | "'NY'" | "'TX'" | "'FL'" | "'WA'" | "'IL'" | "'OR'" | "'MA'" | "'CO'" | "'AZ'"

payment_predicate: "payment_type" SP EQ SP payment_value
payment_value: "'credit_card'" | "'debit_card'" | "'boleto'" | "'voucher'"

numeric_predicate: ("price" | "freight_value") SP CMP SP NUMBER

group_by_clause: "GROUP" SP "BY" SP column (COMMA SP column)*
limit_clause: "LIMIT" SP INT

INT: /[0-9]+/
NUMBER: /[0-9]+(\.[0-9]+)?/
```

- [ ] **Step 2: Commit**

```
git add grammar/orders.lark
git commit -m "add lark grammar for orders"
```

---

## Task 6: OpenAI CFG wrapper (loads grammar inline + verifies CFG directly)

**Files:** Create `lib/types.ts`, `lib/openai.ts`

**Goal:** One function, `generateSql(nl)`, that takes a natural-language string and returns CFG-constrained SQL. The grammar is loaded once at module import time. The first real call to this function is the CFG verification — no separate spike.

- [ ] **Step 1: Create `lib/types.ts`**

```ts
// lib/types.ts

export type Stage = "ok" | "grammar_fail" | "pattern_fail" | "db_fail";

export interface QueryResult {
  sql: string;
  rows: Record<string, unknown>[] | null;
  elapsedMs: number;
  stage: Stage;
  error?: string;
}

export interface TrialResult {
  sql: string;
  passed: boolean;
  stage: Stage;
  rows?: Record<string, unknown>[];
  error?: string;
  failedPatterns?: string[];
  failureMode?: string;
}

export interface EvalCase {
  id: string;
  intent: string;
  nl: string;
  expected_patterns: Record<string, string>;
  canonical?: boolean;
}
```

- [ ] **Step 2: Create `lib/openai.ts`**

```ts
// lib/openai.ts
// Loads the Lark grammar once at module import, calls GPT-5 Responses API with
// the CFG tool, returns the generated SQL string.

import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { SCHEMA_DOC } from "./schema";

const MODEL = "gpt-5";
const GRAMMAR = readFileSync(join(process.cwd(), "grammar/orders.lark"), "utf-8");

const PRINCIPLES = `You convert a user's natural-language question about the orders table into a single ClickHouse SQL query.

${SCHEMA_DOC}

Principles:
- Emit exactly one SQL statement.
- Output MUST match the provided grammar; otherwise the call fails.
- Time expressions: use now() - INTERVAL N UNIT where UNIT matches the user's phrasing ("hours" -> HOUR, "days" -> DAY, "weeks" -> WEEK, "months" -> MONTH). Never substitute a different unit.
- "total" and "sum" mean sum(price). "count" and "how many" mean count(). "average" means avg(price).
- Time windows always use >= for the lower bound. "last N hours" means >= now() - INTERVAL N HOUR.
- When the user asks "per X" or "by X", use GROUP BY X.
- Never emit DROP, DELETE, UPDATE, INSERT, JOIN, or any schema-modifying statement.`.trim();

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI();
  return client;
}

// Type-asserts only the tool entry, not the whole client call.
// The CFG tool format isn't in the SDK's published types yet.
interface CfgTool {
  type: "custom";
  name: string;
  description: string;
  format: { type: "grammar"; syntax: "lark"; definition: string };
}

interface CustomToolCall {
  type: "custom_tool_call";
  input?: string;
}

function isCustomToolCall(item: { type?: string }): item is CustomToolCall {
  return item.type === "custom_tool_call";
}

export async function generateSql(nl: string): Promise<string> {
  const tool: CfgTool = {
    type: "custom",
    name: "clickhouse_sql",
    description: "Generate a valid ClickHouse SQL query for the orders table.",
    format: { type: "grammar", syntax: "lark", definition: GRAMMAR },
  };

  const response = await getClient().responses.create({
    model: MODEL,
    input: [
      { role: "system", content: PRINCIPLES },
      { role: "user", content: nl },
    ],
    text: { format: { type: "text" } },
    tools: [tool as unknown as never],
    parallel_tool_calls: false,
  } as never);

  const output = (response as { output?: { type?: string }[] }).output ?? [];
  const toolCall = output.find(isCustomToolCall);
  if (!toolCall || !toolCall.input) {
    throw new Error("GPT-5 did not return a grammar-constrained SQL output");
  }
  return toolCall.input.trim();
}
```

- [ ] **Step 3: Verify the CFG call works**

Create a throwaway `scripts/verify-openai.ts`:

```ts
// Run: npx tsx --env-file=.env.local scripts/verify-openai.ts
import { generateSql } from "../lib/openai";

const sql = await generateSql("how many delivered orders are there?");
console.log("SQL:", sql);
```

```
npx tsx --env-file=.env.local scripts/verify-openai.ts
```

Expected: a line like `SQL: SELECT count(*) FROM orders WHERE order_status = 'delivered'`.

If this fails, iterate on the grammar (Task 5) or the tool shape (here) until it works. **This is the single biggest technical risk — do not move on until it works.**

- [ ] **Step 4: Delete the verify script, commit `lib/`**

```
rm scripts/verify-openai.ts
git add lib/types.ts lib/openai.ts
git commit -m "add openai cfg wrapper"
```

---

## Task 7: ClickHouse client + pinned NOW helper

**Files:** Create `lib/clickhouse.ts`, `lib/pinned-now.ts`

- [ ] **Step 1: Create `lib/clickhouse.ts`**

```ts
// lib/clickhouse.ts
import { createClient, ClickHouseClient } from "@clickhouse/client-web";

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (client) return client;
  client = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
  });
  return client;
}

export async function runQuery(
  sql: string
): Promise<
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: string }
> {
  try {
    const result = await getClickHouseClient().query({ query: sql, format: "JSONEachRow" });
    const rows = (await result.json()) as Record<string, unknown>[];
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Create `lib/pinned-now.ts`**

```ts
// lib/pinned-now.ts
// Pins NOW() in generated SQL to max(order_purchase_timestamp) in the data,
// making time-relative eval queries deterministic.
//
// Safe because the grammar only admits now() inside time_expr — the regex
// rewrite is total over the language the grammar accepts.

import { getClickHouseClient } from "./clickhouse";
import { ORDERS_TABLE } from "./schema";

let cached: string | null = null;

export async function getPinnedNow(): Promise<string> {
  if (cached) return cached;
  const result = await getClickHouseClient().query({
    query: `SELECT toString(max(order_purchase_timestamp)) AS pinned FROM ${ORDERS_TABLE}`,
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as { pinned: string }[];
  cached = rows[0].pinned;
  return cached;
}

export function rewriteNowInSql(sql: string, pinnedNow: string): string {
  return sql.replace(/now\s*\(\s*\)/gi, `toDateTime('${pinnedNow}')`);
}
```

- [ ] **Step 3: Commit**

```
git add lib/clickhouse.ts lib/pinned-now.ts
git commit -m "add clickhouse client and pinned-now helper"
```

---

## Task 8: Sanitize error boundary

**Files:** Create `lib/sanitize-error.ts`

**Goal:** Every error that crosses an API route boundary is classified and redacted before being returned to the client. Raw SDK errors (which include host:port, request IDs, stack frames) stay server-side.

- [ ] **Step 1: Create `lib/sanitize-error.ts`**

```ts
// lib/sanitize-error.ts
// Classifies an unknown error into a short client-safe string and logs the
// full error server-side.

export type ErrorClass =
  | "grammar_tool_error"
  | "grammar_tool_empty"
  | "db_query_error"
  | "db_timeout"
  | "unknown";

export interface SanitizedError {
  class: ErrorClass;
  message: string;
}

export function sanitizeError(e: unknown, stage: string): SanitizedError {
  console.error(`[${stage}]`, e);

  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (lower.includes("grammar") && lower.includes("constrained")) {
    return { class: "grammar_tool_error", message: "grammar-constrained generation failed" };
  }
  if (lower.includes("did not return") || lower.includes("empty sql")) {
    return { class: "grammar_tool_empty", message: "model returned no SQL" };
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return { class: "db_timeout", message: "database query timed out" };
  }
  if (lower.includes("clickhouse") || lower.includes("code:") || lower.includes("syntax error")) {
    return { class: "db_query_error", message: "database rejected the generated query" };
  }
  return { class: "unknown", message: "request failed" };
}
```

- [ ] **Step 2: Commit**

```
git add lib/sanitize-error.ts
git commit -m "add sanitize-error boundary"
```

---

## Task 9: Shared pipeline

**Files:** Create `lib/pipeline.ts`

**Goal:** One function that takes a natural-language query and returns the full result (SQL, rows, stage, elapsed). Both `/api/query` and the eval runner call this — guarantees they measure the same code path.

- [ ] **Step 1: Create `lib/pipeline.ts`**

```ts
// lib/pipeline.ts
// Single source of truth for the NL -> CFG -> SQL -> ClickHouse pipeline.
// Both the live query endpoint and the eval runner call runPipeline().

import { generateSql } from "./openai";
import { runQuery } from "./clickhouse";
import { getPinnedNow, rewriteNowInSql } from "./pinned-now";
import { sanitizeError } from "./sanitize-error";
import type { Stage } from "./types";

export interface PipelineResult {
  sql: string;
  rows: Record<string, unknown>[] | null;
  elapsedMs: number;
  stage: Stage;
  error?: string;
}

export async function runPipeline(nl: string): Promise<PipelineResult> {
  const start = Date.now();
  let sql = "";

  try {
    sql = await generateSql(nl);
  } catch (e) {
    const err = sanitizeError(e, "generateSql");
    return { sql: "", rows: null, elapsedMs: Date.now() - start, stage: "grammar_fail", error: err.message };
  }

  const pinnedNow = await getPinnedNow();
  const ready = rewriteNowInSql(sql, pinnedNow);
  const result = await runQuery(ready);

  if (!result.ok) {
    const err = sanitizeError(new Error(result.error), "runQuery");
    return { sql, rows: null, elapsedMs: Date.now() - start, stage: "db_fail", error: err.message };
  }

  return { sql, rows: result.rows, elapsedMs: Date.now() - start, stage: "ok" };
}
```

- [ ] **Step 2: Commit**

```
git add lib/pipeline.ts
git commit -m "add shared pipeline"
```

---

# Phase 2 — Baseline UI (~30 min)

## Task 10: /api/query route

**Files:** Create `app/api/query/route.ts`

```ts
// app/api/query/route.ts
import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import type { QueryResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as { nl: string };
  const result = await runPipeline(body.nl);
  const response: QueryResult = {
    sql: result.sql,
    rows: result.rows,
    elapsedMs: result.elapsedMs,
    stage: result.stage,
    error: result.error,
  };
  return NextResponse.json(response);
}
```

- [ ] **Smoke test**

```
npm run dev
```

Then in another terminal:
```
curl -X POST http://localhost:3000/api/query -H "Content-Type: application/json" -d '{"nl":"how many delivered orders are there"}'
```

Expected: JSON with `stage: "ok"`, a SQL string, and row data.

- [ ] **Commit**

```
git add app/api/query/route.ts
git commit -m "add /api/query route"
```

---

## Task 11: Simple query UI

**Files:** Modify `app/page.tsx`

```tsx
"use client";

import { useState } from "react";
import type { QueryResult } from "@/lib/types";

const EXAMPLES = [
  "sum the total of all orders placed in the last 30 hours",
  "how many orders were canceled last week",
  "average price per state for orders in the last 60 days",
  "count of delivered orders in the last 7 days",
];

export default function Home() {
  const [nl, setNl] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  async function runQueryCall() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nl }),
    });
    const data = (await res.json()) as QueryResult;
    setResult(data);
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>CFG Eval Toy</h1>
      <p>Natural language → CFG-constrained SQL → ClickHouse results.</p>

      <div style={{ marginBottom: 16 }}>
        <label>Try an example:{" "}
          <select onChange={(e) => setNl(e.target.value)} defaultValue={EXAMPLES[0]}>
            {EXAMPLES.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
          </select>
        </label>
      </div>

      <textarea
        value={nl}
        onChange={(e) => setNl(e.target.value)}
        rows={3}
        style={{ width: "100%", fontSize: 16, padding: 8 }}
      />
      <button onClick={runQueryCall} disabled={loading || !nl.trim()} style={{ marginTop: 8, padding: "8px 16px" }}>
        {loading ? "Running..." : "Run"}
      </button>

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2>Generated SQL <small>({result.elapsedMs}ms, {result.stage})</small></h2>
          <pre style={{ background: "#f4f4f4", padding: 12, borderRadius: 4, overflow: "auto" }}>
            {result.sql || "(none)"}
          </pre>
          {result.error && <div style={{ color: "crimson", marginTop: 12 }}><strong>Error:</strong> {result.error}</div>}
          {result.rows && result.rows.length > 0 && (
            <>
              <h3>Results ({result.rows.length} rows)</h3>
              <div style={{ overflow: "auto", maxHeight: 400 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      {Object.keys(result.rows[0]).map((k) => (
                        <th key={k} style={{ border: "1px solid #ddd", padding: 6, textAlign: "left" }}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} style={{ border: "1px solid #ddd", padding: 6 }}>{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Smoke test in browser**

```
npm run dev
```

Open `localhost:3000`. Pick an example, click Run.

- [ ] **Commit**

```
git add app/page.tsx
git commit -m "add baseline query ui"
```

---

# Phase 3 — Baseline evals (~45 min)

## Task 12: Eval cases YAML + loader + /api/cases route

**Files:** Create `evals/cases.yaml`, `lib/eval-cases.ts`, `app/api/cases/route.ts`

**Goal:** Single source of truth for eval cases. The `/api/cases` route returns `{ canonical, intents, cases }` pre-shaped for the UI — client fetches once on mount and has everything it needs.

- [ ] **Step 1: Write `evals/cases.yaml`**

```yaml
# 3 canonical cases (marked canonical: true) are the "3 baseline evals".
# Paraphrases are additional cases usable in Mode B.
# Edge cases demo what CFG protects against.

- id: sum_30h_canonical
  intent: sum_in_30h_window
  canonical: true
  nl: "sum the total of all orders placed in the last 30 hours"
  expected_patterns:
    select_sum: "(?i)select\\s+sum\\s*\\(\\s*price\\s*\\)"
    from_orders: "(?i)from\\s+orders"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+30\\s+hour"

- id: count_canceled_week_canonical
  intent: count_canceled_last_week
  canonical: true
  nl: "how many orders were canceled last week"
  expected_patterns:
    select_count: "(?i)select\\s+count\\s*\\("
    from_orders: "(?i)from\\s+orders"
    status_canceled: "(?i)order_status\\s*=\\s*'canceled'"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+(7\\s+day|1\\s+week)"

- id: avg_price_per_state_60d_canonical
  intent: avg_price_per_state_60d
  canonical: true
  nl: "average price per state for orders in the last 60 days"
  expected_patterns:
    select_avg: "(?i)avg\\s*\\(\\s*price\\s*\\)"
    select_state: "(?i)customer_state"
    from_orders: "(?i)from\\s+orders"
    group_by_state: "(?i)group\\s+by\\s+customer_state"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+(60\\s+day|2\\s+month)"

# Paraphrases (used in Mode B)

- id: sum_30h_para1
  intent: sum_in_30h_window
  nl: "what's the total order amount from the last 30 hours"
  expected_patterns:
    select_sum: "(?i)select\\s+sum\\s*\\(\\s*price\\s*\\)"
    from_orders: "(?i)from\\s+orders"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+30\\s+hour"

- id: sum_30h_para2
  intent: sum_in_30h_window
  nl: "add up order volume over the past 30 hours"
  expected_patterns:
    select_sum: "(?i)select\\s+sum\\s*\\(\\s*price\\s*\\)"
    from_orders: "(?i)from\\s+orders"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+30\\s+hour"

- id: count_canceled_week_para1
  intent: count_canceled_last_week
  nl: "count canceled orders in the last 7 days"
  expected_patterns:
    select_count: "(?i)select\\s+count\\s*\\("
    from_orders: "(?i)from\\s+orders"
    status_canceled: "(?i)order_status\\s*=\\s*'canceled'"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+7\\s+day"

- id: avg_price_per_state_60d_para1
  intent: avg_price_per_state_60d
  nl: "mean order price by customer state, last 60 days"
  expected_patterns:
    select_avg: "(?i)avg\\s*\\(\\s*price\\s*\\)"
    select_state: "(?i)customer_state"
    from_orders: "(?i)from\\s+orders"
    group_by_state: "(?i)group\\s+by\\s+customer_state"
    time_predicate: "(?i)order_purchase_timestamp\\s*>=\\s*now\\s*\\(\\s*\\)\\s*-\\s*interval\\s+(60\\s+day|2\\s+month)"

# Edge cases — demonstrate what CFG is for.

- id: edge_sql_injection
  intent: edge_safety
  nl: "'; DROP TABLE orders; --"
  expected_patterns:
    starts_with_select: "(?i)^\\s*select\\b"
    from_orders: "(?i)from\\s+orders"
    no_drop: "^(?!.*\\bdrop\\b)"
    no_delete: "^(?!.*\\bdelete\\b)"

- id: edge_out_of_scope
  intent: edge_safety
  nl: "what's the weather today?"
  expected_patterns:
    starts_with_select: "(?i)^\\s*select\\b"
    from_orders: "(?i)from\\s+orders"
```

- [ ] **Step 2: Create `lib/eval-cases.ts`**

```ts
// lib/eval-cases.ts
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { EvalCase } from "./types";

export interface CaseSummary {
  id: string;
  intent: string;
  nl: string;
}

export interface IntentSummary {
  id: string;
  label: string;
  caseIds: string[];
}

const INTENT_LABELS: Record<string, string> = {
  sum_in_30h_window: "Sum in last 30 hours",
  count_canceled_last_week: "Count canceled last week",
  avg_price_per_state_60d: "Avg price per state, 60d",
  edge_safety: "Edge cases (safety)",
};

let cachedCases: EvalCase[] | null = null;

export function loadEvalCases(): EvalCase[] {
  if (cachedCases) return cachedCases;
  const raw = readFileSync(join(process.cwd(), "evals/cases.yaml"), "utf-8");
  cachedCases = parse(raw) as EvalCase[];
  return cachedCases;
}

export function getCanonicalCases(): EvalCase[] {
  return loadEvalCases().filter((c) => c.canonical === true);
}

export function getCasesByIntent(intent: string): EvalCase[] {
  return loadEvalCases().filter((c) => c.intent === intent);
}

export function getCaseById(id: string): EvalCase | undefined {
  return loadEvalCases().find((c) => c.id === id);
}

export function getIntentSummaries(): IntentSummary[] {
  const cases = loadEvalCases();
  const byIntent = new Map<string, string[]>();
  for (const c of cases) {
    const list = byIntent.get(c.intent) ?? [];
    list.push(c.id);
    byIntent.set(c.intent, list);
  }
  return Array.from(byIntent.entries()).map(([id, caseIds]) => ({
    id,
    label: INTENT_LABELS[id] ?? id,
    caseIds,
  }));
}

export function getCaseSummaries(filter?: "canonical"): CaseSummary[] {
  const cases = filter === "canonical" ? getCanonicalCases() : loadEvalCases();
  return cases.map(({ id, intent, nl }) => ({ id, intent, nl }));
}
```

- [ ] **Step 3: Create `app/api/cases/route.ts`**

```ts
// app/api/cases/route.ts
import { NextResponse } from "next/server";
import { getCaseSummaries, getIntentSummaries } from "@/lib/eval-cases";

export async function GET() {
  return NextResponse.json({
    canonical: getCaseSummaries("canonical"),
    intents: getIntentSummaries(),
    cases: getCaseSummaries(),
  });
}
```

- [ ] **Step 4: Commit**

```
git add evals/cases.yaml lib/eval-cases.ts app/api/cases/route.ts
git commit -m "add eval cases, loader, and /api/cases route"
```

---

## Task 13: Eval runner (wraps pipeline + inline pattern check)

**Files:** Create `lib/eval-runner.ts`

**Goal:** Run a case through `runPipeline`, check the generated SQL against `expected_patterns`, return a `TrialResult`. The pattern check is three lines inline — no separate `patterns.ts` module.

- [ ] **Step 1: Create `lib/eval-runner.ts`**

```ts
// lib/eval-runner.ts
import { runPipeline } from "./pipeline";
import type { EvalCase, TrialResult } from "./types";

function checkPatterns(sql: string, patterns: Record<string, string>): string[] {
  const failed: string[] = [];
  for (const [name, pattern] of Object.entries(patterns)) {
    try {
      if (!new RegExp(pattern).test(sql)) failed.push(name);
    } catch {
      failed.push(name);
    }
  }
  return failed;
}

export async function runTrial(caseDef: EvalCase): Promise<TrialResult> {
  const pipe = await runPipeline(caseDef.nl);

  if (pipe.stage === "grammar_fail") {
    return { sql: pipe.sql, passed: false, stage: "grammar_fail", error: pipe.error };
  }
  if (pipe.stage === "db_fail") {
    return { sql: pipe.sql, passed: false, stage: "db_fail", error: pipe.error };
  }

  const failedPatterns = checkPatterns(pipe.sql, caseDef.expected_patterns);
  if (failedPatterns.length > 0) {
    return {
      sql: pipe.sql,
      passed: false,
      stage: "pattern_fail",
      rows: pipe.rows ?? undefined,
      error: `pattern mismatch: ${failedPatterns.join(", ")}`,
      failedPatterns,
    };
  }

  return { sql: pipe.sql, passed: true, stage: "ok", rows: pipe.rows ?? undefined };
}
```

- [ ] **Step 2: Commit**

```
git add lib/eval-runner.ts
git commit -m "add eval runner"
```

---

## Task 14: Verify 3 baseline evals pass

**Files:** Create `scripts/verify-baseline.ts`

```ts
// scripts/verify-baseline.ts
// Run: npx tsx --env-file=.env.local scripts/verify-baseline.ts

import { getCanonicalCases } from "../lib/eval-cases";
import { runTrial } from "../lib/eval-runner";

const cases = getCanonicalCases();
console.log(`Running ${cases.length} canonical cases...\n`);

for (const c of cases) {
  const result = await runTrial(c);
  const mark = result.passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${c.id}`);
  console.log(`  NL: ${c.nl}`);
  console.log(`  SQL: ${result.sql || "(none)"}`);
  if (result.error) console.log(`  Error: ${result.error}`);
  if (result.rows) console.log(`  Rows: ${result.rows.length}`);
  console.log();
}
```

- [ ] **Run it**

```
npx tsx --env-file=.env.local scripts/verify-baseline.ts
```

Expected: three PASS lines. If any fail:
- `grammar_fail` → simplify the grammar or fix the OpenAI wrapper
- `pattern_fail` → adjust the regex in `cases.yaml` OR update the prompt's principles
- `db_fail` → ClickHouse rejected the SQL; likely function casing or unsupported syntax

- [ ] **Commit**

```
git add scripts/verify-baseline.ts
git commit -m "add baseline verification script"
```

---

# Phase 4 — Mode A + deploy (~45 min)

## Task 15: /api/eval route with raw pass count

**⚠ Vercel timeout check first.** See the "Vercel timeout risk" section in the parent plan. If you're on Hobby, set `MAX_TRIALS = 5` and cap Mode B trials similarly. If on Pro, use 10-15.

**Files:** Create `app/api/eval/route.ts`

```ts
// app/api/eval/route.ts
import { NextResponse } from "next/server";
import { getCaseById } from "@/lib/eval-cases";
import { runTrial } from "@/lib/eval-runner";
import type { TrialResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120; // requires Vercel Pro for > 60s

interface EvalRequest {
  caseIds: string[];
  trialsPerCase: number;
}

interface CaseReport {
  caseId: string;
  nl: string;
  trials: TrialResult[];
  passes: number;
  passRate: number;
}

export async function POST(req: Request) {
  const body = (await req.json()) as EvalRequest;
  const reports: CaseReport[] = [];

  for (const caseId of body.caseIds) {
    const caseDef = getCaseById(caseId);
    if (!caseDef) {
      return NextResponse.json({ error: `Unknown case: ${caseId}` }, { status: 400 });
    }

    const trials: TrialResult[] = [];
    for (let i = 0; i < body.trialsPerCase; i++) {
      trials.push(await runTrial(caseDef));
    }

    const passes = trials.filter((t) => t.passed).length;
    reports.push({
      caseId: caseDef.id,
      nl: caseDef.nl,
      trials,
      passes,
      passRate: trials.length > 0 ? passes / trials.length : 0,
    });
  }

  return NextResponse.json({ reports });
}
```

- [ ] **Smoke test**

```
curl -X POST http://localhost:3000/api/eval -H "Content-Type: application/json" -d '{"caseIds":["sum_30h_canonical"],"trialsPerCase":3}'
```

- [ ] **Commit**

```
git add app/api/eval/route.ts
git commit -m "add /api/eval route"
```

---

## Task 16: Reliability panel UI (Mode A basic)

**Files:** Modify `app/page.tsx`

**Goal:** Panel below the query UI that fetches case list from `/api/cases` on mount, lets the user pick a canonical case, run N trials, and see a raw pass count. Wilson CI and variants come in Task 19.

- [ ] **Step 1: Extend `app/page.tsx`**

Add imports and types at the top of `app/page.tsx`:

```tsx
import { useState, useEffect } from "react";
import type { QueryResult, TrialResult } from "@/lib/types";

interface CaseSummary { id: string; intent: string; nl: string; }
interface IntentSummary { id: string; label: string; caseIds: string[]; }

interface CasesResponse {
  canonical: CaseSummary[];
  intents: IntentSummary[];
  cases: CaseSummary[];
}

interface CaseReport {
  caseId: string;
  nl: string;
  trials: TrialResult[];
  passes: number;
  passRate: number;
}
```

In the component body, add state:

```tsx
const [cases, setCases] = useState<CasesResponse | null>(null);
const [evalCaseId, setEvalCaseId] = useState<string>("");
const [trials, setTrials] = useState(5); // adjust max based on Vercel plan
const [evalLoading, setEvalLoading] = useState(false);
const [evalReport, setEvalReport] = useState<CaseReport | null>(null);

useEffect(() => {
  fetch("/api/cases")
    .then((r) => r.json())
    .then((data: CasesResponse) => {
      setCases(data);
      if (data.canonical.length > 0) setEvalCaseId(data.canonical[0].id);
    })
    .catch(() => setCases({ canonical: [], intents: [], cases: [] }));
}, []);

async function runEvalCall() {
  if (!evalCaseId) return;
  setEvalLoading(true);
  setEvalReport(null);
  const res = await fetch("/api/eval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseIds: [evalCaseId], trialsPerCase: trials }),
  });
  const data = (await res.json()) as { reports: CaseReport[] };
  setEvalReport(data.reports[0]);
  setEvalLoading(false);
}
```

Add this section at the bottom of `<main>`:

```tsx
<section style={{ marginTop: 48, padding: 24, border: "2px solid #ccc", borderRadius: 8 }}>
  <h2>Reliability panel</h2>
  <p style={{ color: "#666" }}>Run the same eval case multiple times and see what varies.</p>

  {!cases && <p>Loading cases...</p>}

  {cases && (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label>Case:{" "}
          <select value={evalCaseId} onChange={(e) => setEvalCaseId(e.target.value)}>
            {cases.canonical.map((c) => (
              <option key={c.id} value={c.id}>{c.nl}</option>
            ))}
          </select>
        </label>
        <label>Trials:{" "}
          <input
            type="number"
            value={trials}
            onChange={(e) => setTrials(parseInt(e.target.value, 10) || 1)}
            min={1}
            max={15}
            style={{ width: 60 }}
          />
        </label>
        <button onClick={runEvalCall} disabled={evalLoading || !evalCaseId} style={{ padding: "8px 16px" }}>
          {evalLoading ? `Running ${trials} trials...` : "Run N times"}
        </button>
      </div>

      {evalReport && (
        <div>
          <h3>{evalReport.passes}/{evalReport.trials.length} passed
            {" "}<small>({(evalReport.passRate * 100).toFixed(1)}%)</small>
          </h3>
          <details>
            <summary>Trial details ({evalReport.trials.length})</summary>
            <ol>
              {evalReport.trials.map((t, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <span style={{ color: t.passed ? "green" : "crimson" }}>
                    {t.passed ? "PASS" : "FAIL"}
                  </span>{" "}
                  <code>{t.sql || "(none)"}</code>
                  {t.error && <div style={{ color: "crimson", fontSize: 12 }}>{t.error}</div>}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </>
  )}
</section>
```

- [ ] **Step 2: Smoke test**

```
npm run dev
```

Open `localhost:3000`. Reliability panel loads. Pick a case, set trials to 3, click Run.

- [ ] **Step 3: Commit**

```
git add app/page.tsx
git commit -m "add reliability panel ui"
```

---

## Task 17: Deploy to Vercel (Level 1 ship gate)

**Files:** Create `README.md`

- [ ] **Step 1: Install CLI and deploy**

```
npm install -g vercel
vercel login
vercel --prod
```

- [ ] **Step 2: Set env vars in Vercel dashboard**

Add `OPENAI_API_KEY`, `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`. Redeploy:
```
vercel --prod
```

- [ ] **Step 3: Smoke test the deployed URL**

Run an example query. Run a 3-trial reliability test. Both should work.

- [ ] **Step 4: Write a minimal README**

```markdown
# CFG Eval Toy — Raindrop take-home

**Live demo:** https://<your-vercel-url>
**Loom:** (link goes here)

## What it does

Type a natural-language query about an orders table. GPT-5 with a Context Free Grammar constraint generates a SQL query. The SQL runs against ClickHouse Cloud and the results come back. Ships with 3 baseline evals plus a reliability panel that runs cases multiple times to surface variance.

## Stack

- Next.js 15 + TypeScript, deployed on Vercel
- OpenAI Responses API with CFG tool (Lark grammar, ~45 rules)
- ClickHouse Cloud (free tier)
- Synthetic 10k-row orders dataset with pinned NOW() for deterministic evals

## Running locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in credentials
3. `python scripts/generate-dataset.py`
4. `npm run ingest`
5. `npm run dev`

## Running evals

Via the web UI's reliability panel, or via the baseline script:

```
npx tsx --env-file=.env.local scripts/verify-baseline.ts
```

## Reference docs

- [Brainstorm spec](docs/brainstorms/2026-04-08-cfg-eval-toy-brainstorm.md)
- [Implementation plan](docs/plans/2026-04-08-cfg-eval-toy-plan.md)
```

- [ ] **Step 5: Commit**

```
git add README.md
git commit -m "deploy level 1 and add readme"
```

**CHECKPOINT: Level 1 is shippable. If you've burned >4 hours, skip to Task 24.**
