---
name: NC relay wiring
description: Relay boards are Normally Closed — bitmask must be built from OFF channels, not ON channels.
---

# NC Relay Wiring — bitmask inversion rule

## The rule
The physical relay boards are wired **Normally Closed (NC)**:
- Relay **de-energised** (bit = 0) → NC contacts **closed** → circuit complete → room **power ON**
- Relay **energised** (bit = 1) → NC contacts **open** → circuit broken → room **power OFF**

## How to apply
In `slateMaskHex` (`artifacts/api-server/src/lib/powerQueue.ts`), set a channel's bit when its `state === 0` (OFF), **not** when `state === 1`:

```typescript
// CORRECT for NC wiring
if (c.slate === slate && c.state === 0) {
  mask |= 1 << (c.channel - 1);
}
```

Never change this back to `state === 1` — that was the bug.

**Why:** When the mask is built from ON channels, switching a room ON energises the relay, which opens the NC contact and cuts power — the exact opposite of what the user expects.

## Scope
This one function covers ALL operations: checkin, checkout, visiting, cleaning, maintenance, manual toggle, auto-cutoff, and HMS sync. Do not add per-operation logic; fix it only here.
