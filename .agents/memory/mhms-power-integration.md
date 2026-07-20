---
name: MHMS PowerLog integration design
description: Design decisions for the MHMS front-office → PowerHub command queue, device protocol, sessions/report, and auto-cutoff
---

# MHMS PowerLog integration — key decisions

- **Command flow**: MHMS calls `POST /api/integration/power/commands` (header `X-API-Key` only — query-string keys were rejected in review as log-leak risk). Commands land in `power_logs` with `flag=0`; relay box polls `GET /api/PowerDeviceApi/:code` (response `CODE+*0XPP+$0XQQ#RRRR+` or `NOCMD`), acks via `GET /api/PowerDeviceStatusApi/:code/:rand` → flag=1. These two device endpoints are unauthenticated by legacy firmware contract and mounted BEFORE `requireAuth` in the router registry.
- **Bitmasks**: every command re-encodes the FULL per-slate state of the device (slate1 → `*0X..` push, slate2 → `$0X..` pull), not a delta. randomNo is 4-digit (legacy firmware format); mitigated with per-IP+path rate limiting (30 req/10s) rather than widening the token.
- **Device identity**: `devices.code` is globally UNIQUE (DB constraint) — boxes identify solely by code, collision across properties would break tenant isolation.
- **Sessions/report**: `power_sessions` opens on OFF→ON per control with wattage SNAPSHOT (so later edits don't rewrite history); kWh = wattage×hours/1000, cost from `properties.tariffPerKwh`. Carries grcNo/billNo/guestName/requestedBy from MHMS.
- **Auto-cutoff** (the legacy system's missing piece): in-process 30s sweep in api-server closes sessions past `cutoffDueAt` (= start + process master `cutoffMinutes` when `isAuto`) and enqueues OFF commands with source `auto-cutoff`.
- **API keys**: `api_keys` stores only SHA-256 hash + display prefix (`phk_…`); plaintext shown once at creation. Property-scoped → key implies tenant.
- **Why**: user confirmed consumption = wattage × hours-ON, cutoff config lives in Process master, and MHMS integrates via REST (not DB insert like legacy).
- **Gotcha**: drizzle-kit push prompts interactively when adding a unique constraint to a non-empty table — apply the constraint via direct SQL first, then push becomes a no-op.
- Excel export is client-side CSV; PDF via print stylesheet; mail/WhatsApp are mailto/wa.me share links with the totals summary.
