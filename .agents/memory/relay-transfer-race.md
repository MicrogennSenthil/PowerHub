---
name: Relay transfer race condition and fixes
description: Three-layer bug in simultaneous MHMS checkout+checkin on the same device, and the three fixes applied.
---

# Relay transfer race condition (July 2026)

## The bug (three layers)

When MHMS sends checkout room A + checkin room B at the same time, both hit the Express server as concurrent HTTP requests for device 000001.

### Layer 1 — Wrong supersession scope
Original code superseded ALL pending commands for the entire device. So room B's ON command ate room A's OFF command before the relay board received it. Board only got `*0X14` (B ON) → room A relay stayed energised.

### Layer 2 — randomNo collision
After fixing to room-level supersession (only supersede same-roomId), two pending rows for the same device could get the same 4-digit randomNo (1000–9999 range). The ack handler matches by `(deviceId, randomNo, flag=0)`, so acking the first command silently acked the second — second command never reached the board.

### Layer 3 — Relay physical settle time
With both commands queued and unique randomNos, the board processed `*0X00` (clear all) then `*0X21` (set new room) back-to-back inside one poll cycle. The relay contacts for the old room never fully opened before the new command re-energised the same coil. Old room stayed on.

## Three fixes (all in `artifacts/api-server/src/`)

| File | Change |
|---|---|
| `lib/powerQueue.ts` | Supersession now scoped to same `roomId`; falls back to full-device if either side has no roomId |
| `lib/powerQueue.ts` | randomNo generation queries existing pending randomNos for the device and retries until collision-free (cap 50 iterations) |
| `routes/integrationPower.ts` | DB-based settle check: poll handler queries `MAX(receivedAt)` for the device from the DB; holds off for `RELAY_SETTLE_MS = 5000 ms` after last ack |

## Why DB-based (not in-memory)
The original fix used an in-memory `deviceLastAckedMs` map. That map is wiped on every PM2 restart or deploy, so the first transfer after any deployment had zero settle delay — explaining why the bug was *intermittent*. Replaced with a query on `powerLogsTable` (flag=1, order by id desc, limit 1) which survives restarts.

## Why 5 seconds
Bumped from 2 s to 5 s: 5 s is imperceptible to guests but provides extra margin over any realistic relay coil settle time or board poll interval variation. Confirmed working in production on 30 Jul 2026.

## Fourth bug — stale bitmask snapshot (concurrent transactions)
When MHMS sends checkout + checkin simultaneously, two `enqueueControlChange` transactions run concurrently. The checkin transaction reads `controlsTable` **before** the checkout transaction commits, so it sees the old room still as `state=1` and bakes its channel bit into `controlPush`. The settle delay correctly spaces delivery 5 s apart, but the ON command still carries the old room's bit — re-energising its relay after it went dark.

Fix: in the poll handler (`routes/integrationPower.ts`), discard the stored `controlPush`/`controlPull` snapshot and re-read all controls for the device live from the DB. By the time the board polls for the second command both transactions have long since committed, so the live bitmask is always accurate. A log line flags whenever the live mask diverges from the stored snapshot (`stale snapshot corrected`).

## Key invariant
The `buildPush`/`buildPull` bitmasks in `slateMaskHex()` are full-state writes (all relay channels set simultaneously). The bitmask must reflect the **live** control states at delivery time — never the enqueue-time snapshot, which can be racily stale. The settle delay is a separate concern: it ensures the physical relay contacts have time to open before the next full-state write arrives.
