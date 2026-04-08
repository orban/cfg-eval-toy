// Eval case loader. Only the two functions currently used by
// scripts/verify-baseline.ts are exported. The rest of the case-shaping layer
// (intent summaries, per-intent filtering, /api/cases route) will come back
// in Phase 4 when the reliability panel UI actually consumes it.

import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { EvalCase } from "./types";

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
