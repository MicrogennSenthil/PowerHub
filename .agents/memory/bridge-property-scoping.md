---
name: Bridge property scoping
description: How relay boxes with duplicate device codes across properties are disambiguated
---

Device codes are unique **per property only** — cross-property duplicates are allowed by design (no warning; the user explicitly wants none).

**How it works:** each site's companion bridge sets `propertyCode` in `config.json` (the hotel's short code from Masters → Properties, case-insensitive) and sends it as `x-property-code` on every forwarded request. The server resolves property by `lower(code)` (unique index), then device by `(device code, property_id)` — used by both the poll and ack endpoints. Unknown property code → 404 UNKNOWN (misconfig surfaces loudly, never silently falls back).

**Legacy compat:** numeric `x-property-id` header still accepted; no header at all → old heuristic (poll prefers device with pending command; ack takes LIMIT 1). Heuristic path is unreliable with duplicated codes — every multi-property site must set `propertyCode`.

**Why:** relay boxes all poll the same central server; WiFi/SSID is irrelevant. Without bridge-supplied scope, whichever device row is found first wins and the other property's commands stall.

**How to apply:** never re-add a global uniqueness constraint or cross-property duplicate warning on device codes; always keep the bridge as the sole authority for the scope headers (it strips caller-supplied values).
