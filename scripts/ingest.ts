// One-shot CSV -> ClickHouse loader.
// Run: npm run ingest
// Also verifies ClickHouse connectivity by querying version() first.

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
  const version = await client.query({
    query: "SELECT version()",
    format: "JSONEachRow",
  });
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
  await client.insert({
    table: ORDERS_TABLE,
    values: rows,
    format: "JSONEachRow",
  });

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
