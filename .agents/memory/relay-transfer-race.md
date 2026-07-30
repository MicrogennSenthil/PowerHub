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
| `routes/integrationPower.ts` | In-memory `deviceLastAckedMs` map; poll endpoint returns empty (hold-off) for 2 s after any ack (`RELAY_SETTLE_MS = 2000`) |

## Why 2 seconds
Physical bistable (latching) relay coil needs ~50–200 ms to de-latch, but we use 2 s as a conservative margin. The board polls every few seconds anyway, so the effective latency impact is at most one additional poll cycle.

## Key invariant
The `buildPush`/`buildPull` bitmasks in `slateMaskHex()` are full-state writes intended for the firmware (all channels set to the mask value). The settle delay is a safety net for firmware that may apply commands too fast for physical relay response.
