// POST /api/query — natural language to ClickHouse SQL result.
// Thin wrapper around runPipeline so the UI measures the same code path
// as the eval runner.

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import type { QueryResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_NL_LENGTH = 2000;

export async function POST(req: Request) {
  let body: { nl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body?.nl !== "string" || !body.nl.trim()) {
    return NextResponse.json({ error: "nl is required" }, { status: 400 });
  }
  if (body.nl.length > MAX_NL_LENGTH) {
    return NextResponse.json(
      { error: `nl too long (max ${MAX_NL_LENGTH} chars)` },
      { status: 400 }
    );
  }

  const pipe = await runPipeline(body.nl);
  const response: QueryResult = {
    sql: pipe.sql,
    rows: pipe.rows,
    elapsedMs: pipe.elapsedMs,
    stage: pipe.stage,
    error: pipe.error,
  };
  return NextResponse.json(response);
}
