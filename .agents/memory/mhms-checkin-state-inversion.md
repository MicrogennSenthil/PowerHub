---
name: MHMS check-in/checkout state inversion
description: Some MHMS builds send inverted state for check-in/checkout; PowerHub enforces canonical direction server-side.
---

# MHMS check-in/checkout inverted state

## The rule
The MHMS command endpoint force-corrects state for exact-key events `checkin`/`walkin` (always ON) and `checkout` (always OFF), regardless of what MHMS sends. All other processes (Cleaning, Visiting, Maintenance, MD Checkin) pass the sent state through untouched — their ON and OFF are both legitimate.

**Why:** Legacy relay server built bitmasks from ON channels on NC-wired boards, so power reacted inverted. MHMS compensated by swapping ON/OFF for check-in/checkout only. After PowerHub fixed the NC bitmask, those two events double-inverted (check-in cut power, checkout restored it) while newer Cleaning/Visiting/Maintenance flows worked. Semantically check-in can only mean power ON and checkout OFF, so server-side enforcement is safe and makes the fix independent of MHMS release timing.

**How to apply:** Correction lives in the MHMS commands route next to the FORCED_ON_EVENTS/FORCED_OFF_EVENTS sets. A `warning` field in the 202 response and a logger.warn flag every correction — when MHMS starts sending true states, the shim becomes a no-op and can stay or be removed. Never extend the forced sets to timed processes.
