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
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nl }),
      });
      if (!res.ok) {
        setResult({
          sql: "",
          rows: null,
          elapsedMs: 0,
          stage: "grammar_fail",
          error: `request failed (${res.status})`,
        });
        return;
      }
      const data = (await res.json()) as QueryResult;
      setResult(data);
    } catch (e) {
      setResult({
        sql: "",
        rows: null,
        elapsedMs: 0,
        stage: "grammar_fail",
        error: `request failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 4 }}>CFG Eval Toy</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Natural language → CFG-constrained SQL → ClickHouse results.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14 }}>
          Try an example:{" "}
          <select
            onChange={(e) => setNl(e.target.value)}
            defaultValue={EXAMPLES[0]}
            style={{ fontSize: 14, padding: 4 }}
          >
            {EXAMPLES.map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>
        </label>
      </div>

      <textarea
        value={nl}
        onChange={(e) => setNl(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          fontSize: 16,
          padding: 10,
          boxSizing: "border-box",
          border: "1px solid #ccc",
          borderRadius: 4,
          fontFamily: "system-ui, sans-serif",
        }}
      />
      <button
        onClick={runQueryCall}
        disabled={loading || !nl.trim()}
        style={{
          marginTop: 8,
          padding: "10px 20px",
          fontSize: 15,
          background: loading ? "#ccc" : "#0066cc",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Running..." : "Run"}
      </button>

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>
            Generated SQL{" "}
            <small style={{ color: "#666", fontWeight: "normal" }}>
              ({result.elapsedMs}ms, {result.stage})
            </small>
          </h2>
          <pre
            style={{
              background: "#f4f4f4",
              padding: 12,
              borderRadius: 4,
              overflow: "auto",
              fontSize: 13,
              border: "1px solid #e0e0e0",
            }}
          >
            {result.sql || "(none)"}
          </pre>

          {result.error && (
            <div
              style={{
                color: "crimson",
                marginTop: 12,
                padding: 12,
                background: "#fff0f0",
                border: "1px solid #fcc",
                borderRadius: 4,
              }}
            >
              <strong>Error:</strong> {result.error}
            </div>
          )}

          {result.rows && result.rows.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 8 }}>
                Results{" "}
                <small style={{ color: "#666", fontWeight: "normal" }}>
                  ({result.rows.length} {result.rows.length === 1 ? "row" : "rows"})
                </small>
              </h3>
              <div style={{ overflow: "auto", maxHeight: 400, border: "1px solid #e0e0e0", borderRadius: 4 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f4f4f4" }}>
                      {Object.keys(result.rows[0]).map((k) => (
                        <th
                          key={k}
                          style={{
                            borderBottom: "2px solid #ccc",
                            padding: 8,
                            textAlign: "left",
                            fontWeight: 600,
                          }}
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} style={{ padding: 8 }}>
                            {String(v)}
                          </td>
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
