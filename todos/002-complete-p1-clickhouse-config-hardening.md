---
status: pending
priority: p1
issue_id: 002
tags: [code-review, security]
dependencies: []
---

# P1: ClickHouse local config hardening

## Problem Statement

`chdata/config.xml` runs the `default` user with an empty password, `<networks><ip>::/0</ip></networks>` (allow-any), and `<access_management>1</access_management>` (grant-users-to-self). The only thing keeping this safe is `listen_host 127.0.0.1`. The moment anyone runs this on a box with a different listen host — Docker with port publish, tailnet exposure, a misconfigured reverse proxy — the unauthenticated instance is exposed with full DDL/DML rights, and an attacker can also create new persistent users.

Flagged by: security-sentinel (HIGH).

## Findings

`chdata/config.xml:22-32`:
```xml
<default>
    <password></password>
    <networks>
        <ip>::/0</ip>
    </networks>
    <profile>default</profile>
    <quota>default</quota>
    <access_management>1</access_management>
</default>
```

This is the single thing in the repo that would actually bite on Task 17 if the config pattern is copy-pasted into ClickHouse Cloud setup or Docker.

## Proposed Solutions

### Option A (Recommended) — Harden the local dev config

1. Set `<password>dev</password>`
2. Narrow `<networks>` to `127.0.0.1/32` and `::1/128`
3. Drop `<access_management>0</access_management>` (or delete the element)
4. Update `.env.local` with the password

**Pros:** config is safe-by-default, nothing to remember for production.
**Cons:** need to re-run ingest with the new password.
**Effort:** Small (~5 min).
**Risk:** Low.

### Option B — Add a big warning comment and move on

Annotate the XML: `<!-- DEV ONLY: do not copy to any deploy target -->`.

**Pros:** zero time cost.
**Cons:** doesn't actually prevent accidental exposure.
**Effort:** Trivial.
**Risk:** Medium.

## Recommended Action

Option A, before the Loom recording.

## Technical Details

**Affected files:**
- `chdata/config.xml`
- `.env.local`

## Acceptance Criteria

- [ ] Local ClickHouse requires password to connect
- [ ] `listen_host` restricted to loopback in both IPv4 and IPv6
- [ ] `access_management` disabled
- [ ] Ingest still runs after the change

## Work Log

(unstarted)
