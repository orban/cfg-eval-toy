// Eval case loader. Only what the reliability panel + verify-baseline currently
// use is exported. Mode B (paraphrase sweeps) and failure tagger will extend
// this later with getIntentSummaries and per-id lookups.

import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { EvalCase } from "./types";

export interface CaseSummary {
  id: string;
  intent: string;
  nl: string;
}

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

export function getCaseById(id: string): EvalCase | undefined {
  return loadEvalCases().find((c) => c.id === id);
}

export function getCanonicalSummaries(): CaseSummary[] {
  return getCanonicalCases().map(({ id, intent, nl }) => ({ id, intent, nl }));
}
