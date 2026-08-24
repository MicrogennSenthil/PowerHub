---
name: MHMS PowerLog integration design
description: Design decisions for the MHMS front-office → PowerHub command queue, device protocol, sessions/report, and auto-cutoff
---

# MHMS PowerLog integration — key decisions

- **Command flow**: MHMS calls `POST /api/integration/power/commands` (header `X-API-Key` only — query-string keys were rejected in review as log-leak risk). Commands land in `power_logs` with `flag=0`; relay box polls `GET /api/PowerDeviceApi/:code`, acks via `GET /api/PowerDeviceStatusApi/:code/:rand` → flag=1. These two device endpoints are unauthenticated by legacy firmware contract and mounted BEFORE `requireAuth` in the router registry.
- **Exact wire format (verified against real ESP32 + legacy PHP source)**: poll response is `CODE*0XPP$0XQQ#RRRR+` — NO `+` separators between fields, randomNo zero-padded to 4 digits; EMPTY body (not "NOCMD") when queue is empty; ack response is the literal misspelled `Succss`. Any deviation makes the firmware fail to parse randomNo and loop on `PowerDeviceStatusApi/CODE/` with an empty rand (answer that route with `Succss` to unstick it). Firmware also prefixes paths with `/index.php` — the companion bridge strips it (proxy routes `/index.php/*` to the web artifact, so server-side stripping can't work).
- **Bitmasks**: every command re-encodes the FULL per-slate state of the device (slate1 → `*0X..` push, slate2 → `$0X..` pull), not a delta. randomNo is 4-digit (legacy firmware format); mitigated with per-IP+path rate limiting (30 req/10s) rather than widening the token.
- **Device identity**: `devices.code` is globally UNIQUE (DB constraint) — boxes identify solely by code, collision across properties would break tenant isolation.
- **Sessions/report**: `power_sessions` opens on OFF→ON per control with wattage SNAPSHOT (so later edits don't rewrite history); kWh = wattage×hours/1000, cost from `properties.tariffPerKwh`. Carries grcNo/billNo/guestName/requestedBy from MHMS.
- **Auto-cutoff** (the legacy system's missing piece): in-process 30s sweep in api-server closes sessions past `cutoffDueAt` (= start + process master `cutoffMinutes` when `isAuto`) and enqueues OFF commands with source `auto-cutoff`.
- **Process override invariant**: a real MHMS process change while power is already ON must close the prior open session before opening the new one. Visiting/Cleaning → Walk-in/Checkin removes the old timer; manual UI ON does not erase process context. Auto-cutoff must lock the control and verify its exact session is still current before queuing or notifying OFF. **Why:** otherwise an earlier Visiting timer can cut power after the guest has checked in.
- **API keys**: `api_keys` stores only SHA-256 hash + display prefix (`phk_…`); plaintext shown once at creation. Property-scoped → key implies tenant.
- **Why**: user confirmed consumption = wattage × hours-ON, cutoff config lives in Process master, and MHMS integrates via REST (not DB insert like legacy).
- **Gotcha**: drizzle-kit push prompts interactively when adding a unique constraint to a non-empty table — apply the constraint via direct SQL first, then push becomes a no-op.
- Excel export is client-side CSV; PDF via print stylesheet; mail/WhatsApp are mailto/wa.me share links with the totals summary.
