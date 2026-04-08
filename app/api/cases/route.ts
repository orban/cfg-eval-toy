// GET /api/cases — returns the case metadata the reliability panel needs.
// Keeps the shape minimal; Mode B and failure tagger will extend it later.

import { NextResponse } from "next/server";
import { getCanonicalSummaries } from "@/lib/eval-cases";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    canonical: getCanonicalSummaries(),
  });
}
