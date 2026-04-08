// Single source of truth for the orders table schema.
// Shared between the ingest script, the ClickHouse client, and the OpenAI system prompt.

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

// Inlined into the OpenAI system prompt in lib/openai.ts.
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
