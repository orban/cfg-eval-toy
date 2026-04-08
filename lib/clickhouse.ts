// ClickHouse client singleton + runQuery helper.

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
  | { ok: false; error: string; cause: unknown }
> {
  try {
    const result = await getClickHouseClient().query({
      query: sql,
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as Record<string, unknown>[];
    return { ok: true, rows };
  } catch (e) {
    // Log the original error so its .cause/.stack aren't lost when the
    // message gets re-wrapped higher up.
    console.error("[runQuery]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      cause: e,
    };
  }
}
