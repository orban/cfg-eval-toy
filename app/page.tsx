"use client";

import { useEffect, useState } from "react";
import type { QueryResult, TrialResult } from "@/lib/types";

const EXAMPLES = [
  "sum the total of all orders placed in the last 30 hours",
  "how many orders were canceled last week",
  "average price per state for orders in the last 60 days",
  "count of delivered orders in the last 7 days",
];

// Design tokens — matches Raindrop's signals dashboard visual language.
const ink = "#0b1220";
const paper = "#fafaf7";
const mutedInk = "#6b7280";
const subtleBorder = "#e7e5e0";
const cardBg = "#ffffff";
const codeBg = "#f5f5f1";
const okGreen = "#059669";
const errRed = "#dc2626";

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: mutedInk,
  fontWeight: 500,
};

const cardStyle: React.CSSProperties = {
  background: cardBg,
  border: `1px solid ${subtleBorder}`,
  borderRadius: 8,
  padding: 28,
  marginBottom: 24,
};

interface CaseSummary {
  id: string;
  intent: string;
  nl: string;
}

interface CaseReport {
  caseId: string;
  nl: string;
  trials: TrialResult[];
  passes: number;
  passRate: number;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    // Collapse floating-point noise (25459.959999999995 → 25,459.96) while
    // leaving integers alone (65 → 65, 10000 → 10,000).
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function Chip({
  text,
  active,
  onClick,
}: {
  text: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: "6px 12px",
        background: active ? ink : cardBg,
        color: active ? "white" : mutedInk,
        border: `1px solid ${active ? ink : subtleBorder}`,
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: 450,
        whiteSpace: "nowrap",
        transition: "all 120ms ease",
      }}
    >
      {text}
    </button>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: ok ? okGreen : errRed,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}

export default function Home() {
  // --- Query (baseline) state ---
  const [nl, setNl] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  // --- Reliability panel state ---
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [trials, setTrials] = useState(5);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalReport, setEvalReport] = useState<CaseReport | null>(null);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data: { canonical: CaseSummary[] }) => {
        setCases(data.canonical);
        if (data.canonical.length > 0) setSelectedCaseId(data.canonical[0].id);
      })
      .catch(() => setCases([]));
  }, []);

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

  async function runEvalCall() {
    if (!selectedCaseId) return;
    setEvalLoading(true);
    setEvalReport(null);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: [selectedCaseId], trialsPerCase: trials }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[eval] bad response", body);
        return;
      }
      const data = (await res.json()) as { reports: CaseReport[] };
      setEvalReport(data.reports[0] ?? null);
    } catch (e) {
      console.error("[eval] request failed", e);
    } finally {
      setEvalLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "56px 40px 80px",
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            margin: 0,
            color: ink,
          }}
        >
          CFG Eval Toy
        </h1>
        <p
          style={{
            color: mutedInk,
            marginTop: 6,
            marginBottom: 0,
            fontSize: 14,
          }}
        >
          Natural language → grammar-constrained SQL → ClickHouse.
        </p>
      </header>

      {/* ───────── Query card ───────── */}
      <section style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Query</div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {EXAMPLES.map((ex) => (
            <Chip key={ex} text={ex} active={nl === ex} onClick={() => setNl(ex)} />
          ))}
        </div>

        <textarea
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            fontSize: 15,
            padding: 14,
            boxSizing: "border-box",
            border: `1px solid ${subtleBorder}`,
            borderRadius: 6,
            fontFamily: "inherit",
            background: paper,
            color: ink,
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={runQueryCall}
          disabled={loading || !nl.trim()}
          style={{
            marginTop: 14,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 500,
            background: loading || !nl.trim() ? "#9ca3af" : ink,
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: loading || !nl.trim() ? "default" : "pointer",
            letterSpacing: "0.02em",
            fontFamily: "inherit",
          }}
        >
          {loading ? "Running…" : "Run"}
        </button>
      </section>

      {/* ───────── Query result card ───────── */}
      {result && (
        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
            }}
          >
            <div style={labelStyle}>Generated SQL</div>
            <div style={{ fontSize: 11, color: mutedInk, letterSpacing: "0.05em" }}>
              <StatusDot ok={result.stage === "ok"} />
              {result.elapsedMs}ms · {result.stage}
            </div>
          </div>
          <pre
            style={{
              background: codeBg,
              padding: 16,
              borderRadius: 6,
              overflow: "auto",
              fontSize: 13,
              lineHeight: 1.55,
              border: `1px solid ${subtleBorder}`,
              fontFamily: '"SF Mono", Menlo, Monaco, "Cascadia Code", monospace',
              color: ink,
              margin: 0,
            }}
          >
            {result.sql || "(no SQL generated)"}
          </pre>

          {result.error && (
            <div
              style={{
                color: "#b91c1c",
                marginTop: 16,
                padding: 14,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <strong>Error:</strong> {result.error}
            </div>
          )}

          {result.rows && result.rows.length > 0 && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginTop: 28,
                  marginBottom: 12,
                }}
              >
                <div style={labelStyle}>Results</div>
                <div style={{ fontSize: 11, color: mutedInk, letterSpacing: "0.05em" }}>
                  {result.rows.length} {result.rows.length === 1 ? "row" : "rows"}
                </div>
              </div>
              <div
                style={{
                  overflow: "auto",
                  maxHeight: 420,
                  border: `1px solid ${subtleBorder}`,
                  borderRadius: 6,
                }}
              >
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {Object.keys(result.rows[0]).map((k) => (
                        <th
                          key={k}
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: 500,
                            fontSize: 11,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: mutedInk,
                            borderBottom: `1px solid ${subtleBorder}`,
                            background: paper,
                            position: "sticky",
                            top: 0,
                          }}
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom:
                            i === result.rows!.length - 1
                              ? "none"
                              : `1px solid ${subtleBorder}`,
                        }}
                      >
                        {Object.values(row).map((v, j) => (
                          <td
                            key={j}
                            style={{
                              padding: "12px 16px",
                              color: ink,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatCell(v)}
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

      {/* ───────── Reliability panel card ───────── */}
      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <div style={labelStyle}>Reliability</div>
          <div style={{ fontSize: 11, color: mutedInk, letterSpacing: "0.05em" }}>
            Mode A · stochasticity
          </div>
        </div>

        <p style={{ color: mutedInk, fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
          Run the same eval case multiple times and watch what varies. Every trial
          goes through the same NL → grammar → SQL → ClickHouse pipeline the query
          box uses.
        </p>

        {!cases && (
          <div style={{ fontSize: 13, color: mutedInk }}>Loading cases…</div>
        )}

        {cases && cases.length === 0 && (
          <div style={{ fontSize: 13, color: errRed }}>
            No canonical cases found. Check evals/cases.yaml.
          </div>
        )}

        {cases && cases.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <label style={{ fontSize: 13, color: mutedInk }}>
                Case:{" "}
                <select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  style={{
                    fontSize: 13,
                    padding: "6px 10px",
                    border: `1px solid ${subtleBorder}`,
                    borderRadius: 4,
                    background: cardBg,
                    color: ink,
                    fontFamily: "inherit",
                    maxWidth: 400,
                  }}
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nl}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, color: mutedInk }}>
                Trials:{" "}
                <input
                  type="number"
                  value={trials}
                  onChange={(e) => setTrials(Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1)))}
                  min={1}
                  max={5}
                  style={{
                    fontSize: 13,
                    padding: "6px 8px",
                    border: `1px solid ${subtleBorder}`,
                    borderRadius: 4,
                    background: cardBg,
                    color: ink,
                    fontFamily: "inherit",
                    width: 60,
                  }}
                />
              </label>
              <button
                onClick={runEvalCall}
                disabled={evalLoading || !selectedCaseId}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 500,
                  background: evalLoading || !selectedCaseId ? "#9ca3af" : ink,
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: evalLoading || !selectedCaseId ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {evalLoading ? `Running ${trials}…` : `Run ${trials} trials`}
              </button>
            </div>
          </>
        )}

        {evalReport && (
          <div
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: `1px solid ${subtleBorder}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 600, color: ink, fontVariantNumeric: "tabular-nums" }}>
                {evalReport.passes}/{evalReport.trials.length}{" "}
                <span style={{ fontSize: 14, color: mutedInk, fontWeight: 400 }}>
                  passed · {(evalReport.passRate * 100).toFixed(0)}%
                </span>
              </div>
              <StatusDot ok={evalReport.passRate === 1} />
            </div>

            <details style={{ fontSize: 12 }}>
              <summary
                style={{
                  cursor: "pointer",
                  color: mutedInk,
                  padding: "6px 0",
                }}
              >
                Trial details ({evalReport.trials.length})
              </summary>
              <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                {evalReport.trials.map((t, i) => (
                  <li key={i} style={{ marginBottom: 10 }}>
                    <span style={{ color: t.passed ? okGreen : errRed, fontWeight: 500 }}>
                      {t.passed ? "PASS" : "FAIL"}
                    </span>{" "}
                    <span style={{ color: mutedInk }}>({t.stage})</span>
                    <pre
                      style={{
                        fontSize: 11,
                        background: codeBg,
                        padding: 8,
                        borderRadius: 4,
                        marginTop: 4,
                        marginBottom: 0,
                        overflow: "auto",
                        fontFamily: '"SF Mono", Menlo, Monaco, monospace',
                      }}
                    >
                      {t.sql || "(none)"}
                    </pre>
                    {t.error && (
                      <div style={{ color: errRed, marginTop: 4, fontSize: 11 }}>
                        {t.error}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}
