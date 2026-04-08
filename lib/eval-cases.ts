// Eval case loader and shape-for-UI helpers.
// Single source of truth for case metadata across the app.

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
