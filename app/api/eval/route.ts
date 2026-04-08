// POST /api/eval — runs one or more eval cases N times each, returns a
// report per case with raw pass counts. Wilson CI + variant grouping come
// in Phase 5 (Task 19).
//
// Serial execution is deliberate: we want to respect OpenAI rate limits and
// the sharpest demo point is watching Mode A on a single case. Parallelism
// would also blow past Vercel Hobby's 60s function timeout on cold starts.

import { NextResponse } from "next/server";
import { getCaseById } from "@/lib/eval-cases";
import { runTrial } from "@/lib/eval-runner";
import type { TrialResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hard cap to stay under Vercel Hobby's 60s function timeout. ~7s per trial
// in practice, so 5 trials × 1 case = ~35s. Plenty of headroom for cold start.
const MAX_TRIALS_PER_CASE = 5;
const MAX_CASES_PER_REQUEST = 5;

interface EvalRequest {
  caseIds: string[];
  trialsPerCase: number;
}

interface CaseReport {
  caseId: string;
  nl: string;
  trials: TrialResult[];
  passes: number;
  passRate: number;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = body as Partial<EvalRequest>;
  if (!Array.isArray(parsed.caseIds) || parsed.caseIds.length === 0) {
    return NextResponse.json({ error: "caseIds must be a non-empty array" }, { status: 400 });
  }
  if (parsed.caseIds.length > MAX_CASES_PER_REQUEST) {
    return NextResponse.json(
      { error: `too many cases (max ${MAX_CASES_PER_REQUEST})` },
      { status: 400 }
    );
  }
  if (typeof parsed.trialsPerCase !== "number" || parsed.trialsPerCase < 1) {
    return NextResponse.json({ error: "trialsPerCase must be a positive integer" }, { status: 400 });
  }
  const trialsPerCase = Math.min(Math.floor(parsed.trialsPerCase), MAX_TRIALS_PER_CASE);

  const reports: CaseReport[] = [];

  for (const caseId of parsed.caseIds) {
    if (typeof caseId !== "string") {
      return NextResponse.json({ error: "caseIds must be strings" }, { status: 400 });
    }
    const caseDef = getCaseById(caseId);
    if (!caseDef) {
      return NextResponse.json({ error: `unknown case: ${caseId}` }, { status: 400 });
    }

    const trials: TrialResult[] = [];
    for (let i = 0; i < trialsPerCase; i++) {
      trials.push(await runTrial(caseDef));
    }

    const passes = trials.filter((t) => t.passed).length;
    reports.push({
      caseId: caseDef.id,
      nl: caseDef.nl,
      trials,
      passes,
      passRate: trials.length > 0 ? passes / trials.length : 0,
    });
  }

  return NextResponse.json({ reports, maxTrialsPerCase: MAX_TRIALS_PER_CASE });
}
