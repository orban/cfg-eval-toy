---
status: pending
priority: p2
issue_id: 006
tags: [code-review, security, api]
dependencies: []
---

# P2: /api/query input validation + length cap

## Problem Statement

`/api/query` accepts `{nl: string}` with only truthy + typeof checks. No length cap. No wrapping of `req.json()`. No rate limit. Two concrete risks:

1. A 10 MB `nl` payload is shipped straight into OpenAI's Responses call, burning token budget and possibly stalling the Node event loop on large JSON parses.
2. Malformed JSON in the request body rejects `await req.json()`, crashing the route with a raw 500.

Flagged by: kieran-typescript-reviewer (HIGH #3), security-sentinel (MED), silent-failure-hunter (LOW #7).

## Findings

`app/api/query/route.ts:13-17`:
```ts
const body = (await req.json()) as { nl?: string };
if (!body.nl || typeof body.nl !== "string" || !body.nl.trim()) {
  return NextResponse.json({ error: "nl is required" }, { status: 400 });
}
```

Issues:
1. `await req.json()` is not wrapped — malformed body crashes.
2. The `!body.nl || typeof body.nl !== "string"` order is backwards: if `nl: 123`, `!body.nl` is `false`, so it falls through to `typeof`. Works by accident, reads wrong.
3. No `body.nl.length` cap. A 10 MB payload is accepted.

## Proposed Solutions

### Option A (Recommended) — Validate, cap, wrap

```ts
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
  if (body.nl.length > 2000) {
    return NextResponse.json({ error: "nl too long (max 2000 chars)" }, { status: 400 });
  }

  const pipe = await runPipeline(body.nl);
  // ...
}
```

**Pros:** eliminates three concerns in ~10 lines.
**Cons:** none.
**Effort:** Small (~5 min).
**Risk:** None.

### Option B — Add length cap only, skip the JSON wrap

A length cap is the highest-leverage fix (prevents OpenAI budget burn).

**Pros:** minimum change.
**Cons:** leaves the malformed-JSON 500 in place.
**Effort:** Trivial.
**Risk:** Low.

## Recommended Action

Option A.

## Technical Details

**Affected files:**
- `app/api/query/route.ts`

No rate limiting — deferred to deploy time, not worth adding in-app for a take-home.

## Acceptance Criteria

- [ ] Malformed JSON body returns 400 with "invalid JSON body"
- [ ] `nl` longer than 2000 chars returns 400
- [ ] `nl: 123` (number) returns 400 via strict typeof check, not accidental fallthrough

## Work Log

(unstarted)
