// Pins NOW() in generated SQL to max(order_purchase_timestamp) in the data,
// making time-relative eval queries deterministic across runs.
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
  const rows = (await result.json()) as { pinned?: string }[];
  if (!rows[0]?.pinned) {
    throw new Error("pinned-now: orders table is empty or returned no timestamp");
  }
  cached = rows[0].pinned;
  return cached;
}

export function rewriteNowInSql(sql: string, pinnedNow: string): string {
  return sql.replace(/now\s*\(\s*\)/gi, `toDateTime('${pinnedNow}')`);
}
