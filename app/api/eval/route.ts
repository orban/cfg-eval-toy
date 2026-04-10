// POST /api/eval — streams eval results as NDJSON (one trial per line).
//
// Each line is a JSON object: { caseId, nl, index, total, trial }
// The final line is:          { done: true }
//
// Serial execution is deliberate: we want to respect OpenAI rate limits and
// the sharpest demo point is watching Mode A on a single case.

import { NextResponse } from "next/server";
import { getCaseById } from "@/lib/eval-cases";
import { runTrial } from "@/lib/eval-runner";
import type { EvalCase } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TRIALS_PER_CASE = 5;
const MAX_CASES_PER_REQUEST = 5;

interface EvalRequest {
  caseIds: string[];
  trialsPerCase: number;
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

  // Validate all case IDs before starting the stream so we can return a
  // proper 400 for bad input.
  const caseDefs: EvalCase[] = [];
  for (const caseId of parsed.caseIds) {
    if (typeof caseId !== "string") {
      return NextResponse.json({ error: "caseIds must be strings" }, { status: 400 });
    }
    const caseDef = getCaseById(caseId);
    if (!caseDef) {
      return NextResponse.json({ error: `unknown case: ${caseId}` }, { status: 400 });
    }
    caseDefs.push(caseDef);
  }

  const total = caseDefs.length * trialsPerCase;
  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream({
    async start(controller) {
      for (const caseDef of caseDefs) {
        for (let i = 0; i < trialsPerCase; i++) {
          const trial = await runTrial(caseDef);
          const line = JSON.stringify({
            caseId: caseDef.id,
            nl: caseDef.nl,
            index,
            total,
            trial,
          });
          controller.enqueue(encoder.encode(line + "\n"));
          index++;
        }
      }
      controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
