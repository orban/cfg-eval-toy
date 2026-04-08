// GET /api/cases — returns everything the UI needs about eval cases,
// pre-shaped so the client never has to filter or label things itself.

import { NextResponse } from "next/server";
import { getCaseSummaries, getIntentSummaries } from "@/lib/eval-cases";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    canonical: getCaseSummaries("canonical"),
    intents: getIntentSummaries(),
    cases: getCaseSummaries(),
  });
}
