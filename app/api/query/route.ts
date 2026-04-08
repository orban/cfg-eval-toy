// POST /api/query — natural language to ClickHouse SQL result.
// Thin wrapper around runPipeline so the UI measures the same code path
// as the eval runner.

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import type { QueryResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as { nl?: string };
  if (!body.nl || typeof body.nl !== "string" || !body.nl.trim()) {
    return NextResponse.json({ error: "nl is required" }, { status: 400 });
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
