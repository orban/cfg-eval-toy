// GPT-5 Responses API + CFG tool wrapper.
// Grammar is loaded once at module import. Exposes generateSql(nl) -> SQL string.

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
- Time expressions: use now() - INTERVAL N UNIT where UNIT matches the user's phrasing exactly ("hours" -> HOUR, "days" -> DAY, "weeks" -> WEEK, "months" -> MONTH). Never substitute a different unit.
- "total" and "sum" mean sum(price). "count" and "how many" mean count(). "average" and "mean" mean avg(price).
- Time windows always use >= for the lower bound. "last N hours" means order_purchase_timestamp >= now() - INTERVAL N HOUR.
- When the user asks "per X" or "by X", use GROUP BY X.
- Never emit DROP, DELETE, UPDATE, INSERT, JOIN, or any schema-modifying statement.`.trim();

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI();
  return client;
}

// The CFG tool format (`format: { type: "grammar", syntax: "lark", ... }`) is
// supported by the OpenAI Responses API but not typed in the SDK yet — we cast
// only the tool entry, not the whole call.
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
    description: "Generate a valid ClickHouse SELECT query for the orders table.",
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
    console.error("[generateSql] no custom_tool_call in output:", JSON.stringify(output));
    throw new Error("grammar-constrained generation returned no SQL");
  }
  return toolCall.input.trim();
}
