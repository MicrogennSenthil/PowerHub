# PowerHub × MHMS Front-Office Integration Guide

**Version 1.0 — July 2026**
**Audience:** MHMS front-office development team

---

## 1. Overview

PowerHub controls the electrical loads (Light, AC, Plug, Geyser, etc.) of each hotel room through relay devices. MHMS can switch these loads ON/OFF at guest life-cycle events (walk-in/check-in, checkout, room transfer, maintenance, cleaning, visiting) by calling **one simple REST API**.

```
MHMS  ──HTTPS──▶  PowerHub API  ──queue──▶  Relay box in the room
```

- The API **queues** the command instantly (HTTP `202`), and the relay box applies it within its poll interval (typically **4–10 seconds**).
- No hardware knowledge needed on the MHMS side — you only send **room number + on/off + purpose**.

---

## 2. Connection Details

| Item | Value |
|---|---|
| Base URL (production) | `https://power.microgenn.com` |
| Endpoint | `POST /api/integration/power/commands` |
| Authentication | HTTP header `X-API-Key: phk_xxxxxxxxxxxx` |
| Content type | `application/json` |
| Success status | `202 Accepted` (command queued) |

### API Key
- Issued from PowerHub → **API Keys** page, one key **per property/hotel**.
- The key itself identifies the property — you never send a property/hotel ID.
- Send it **only in the `X-API-Key` header** — never in the URL/query string.
- Keys start with `phk_` and are shown only once at creation; store securely.

---

## 3. Request Format

```http
POST /api/integration/power/commands HTTP/1.1
Host: power.microgenn.com
X-API-Key: phk_xxxxxxxxxxxx
Content-Type: application/json
```

```json
{
  "roomNo": "101",
  "state": "on",
  "process": "Checkin",
  "controlTypes": ["Light", "AC"],
  "grcNo": "GRC-2026-0451",
  "billNo": "B-1023",
  "guestName": "Mr. Kumar",
  "username": "fo_reception1"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `roomNo` | string | **Yes** | Room number exactly as configured in PowerHub (e.g. `"101"`). |
| `state` | string | **Yes** | `"on"` or `"off"`. |
| `process` | string or number | No | Process master name (e.g. `"Checkin"`, `"Checkout"`, `"Cleaning"`, `"Maintenance"`, `"Visiting"`) or its numeric ID. Drives auto-cutoff & reporting. **Always send it.** |
| `controlTypes` | array of strings | No | Restrict to specific loads, e.g. `["Light"]`, `["AC"]`, `["Light","AC"]`. **Omit to act on ALL controls in the room.** |
| `grcNo` | string | No | Guest registration card number (appears in power usage reports). |
| `billNo` | string | No | Bill number (appears in reports). |
| `guestName` | string | No | Guest name (appears in reports). |
| `username` | string | No | MHMS operator login who triggered the action (audit trail). |

### Response — `202 Accepted`

```json
{
  "queued": 2,
  "powerLogIds": [1543, 1544],
  "room": "101",
  "state": "on",
  "controls": [
    { "id": 12, "label": "Room Light", "type": "Light" },
    { "id": 13, "label": "Split AC", "type": "AC" }
  ],
  "process": "Checkin",
  "autoCutoffMinutes": null
}
```

`autoCutoffMinutes` — if the process is configured with auto-cutoff in PowerHub (e.g. Cleaning = 30 min), this tells you PowerHub will switch OFF automatically after that many minutes. `null` = stays on until you send OFF.

### Error responses

| Status | Meaning | Action |
|---|---|---|
| `400` | Unknown process name / room has no controls of that type / bad body | Fix the request payload |
| `401` | Missing or invalid `X-API-Key` | Check the key |
| `404` | `roomNo` not found in this property | Verify room number matches PowerHub |
| `5xx` | Server issue | Retry with back-off; contact PowerHub admin |

Errors return JSON: `{ "error": "description" }`.

---

## 4. Front-Office Scenarios (copy-paste recipes)

> All examples use `curl`; convert to your HTTP client. Replace the key and room numbers.

### 4.1 Walk-in / Check-in — switch ON guest's controls
Turn on the loads the guest needs. Send one call with the wanted control types (or omit `controlTypes` to turn on everything).

```bash
curl -X POST https://power.microgenn.com/api/integration/power/commands \
  -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{
    "roomNo": "101",
    "state": "on",
    "process": "Checkin",
    "controlTypes": ["Light", "AC"],
    "grcNo": "GRC-2026-0451",
    "guestName": "Mr. Kumar",
    "username": "fo_reception1"
  }'
```

Only light? → `"controlTypes": ["Light"]`. Everything in the room? → omit `controlTypes`.

### 4.2 Checkout — switch OFF everything in the room

```bash
curl -X POST https://power.microgenn.com/api/integration/power/commands \
  -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{
    "roomNo": "101",
    "state": "off",
    "process": "Checkout",
    "grcNo": "GRC-2026-0451",
    "billNo": "B-1023",
    "username": "fo_cashier1"
  }'
```

Omitting `controlTypes` = **all** controls in the room are switched off. This also closes the power-usage session so the consumption report is finalized against the bill.

### 4.3 Room transfer — OFF old room, then ON new room (two calls)

```bash
# Step 1: switch OFF everything in the old room
curl -X POST .../commands -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{ "roomNo": "101", "state": "off", "process": "Checkout", "grcNo": "GRC-2026-0451", "username": "fo_reception1" }'

# Step 2: switch ON the guest's controls in the new room
curl -X POST .../commands -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{ "roomNo": "205", "state": "on", "process": "Checkin", "controlTypes": ["Light","AC"], "grcNo": "GRC-2026-0451", "guestName": "Mr. Kumar", "username": "fo_reception1" }'
```

Fire both calls back-to-back; each returns independently. Keep the same `grcNo` so reports link the stay across rooms.

### 4.4 Maintenance

```bash
curl -X POST .../commands -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{ "roomNo": "101", "state": "on", "process": "Maintenance", "username": "fo_supervisor" }'
```

When done: same call with `"state": "off"`. If the Maintenance process is configured with auto-cutoff in PowerHub, power turns off automatically after the configured minutes (check `autoCutoffMinutes` in the response).

### 4.5 Cleaning / Housekeeping

```bash
curl -X POST .../commands -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{ "roomNo": "101", "state": "on", "process": "Cleaning", "controlTypes": ["Light"], "username": "hk_desk" }'
```

Recommended: configure Cleaning with auto-cutoff (e.g. 30 min) in PowerHub so housekeeping never leaves loads running. MHMS then does not need to send the OFF call.

### 4.6 Visiting (guest showing the room, short entry)

```bash
curl -X POST .../commands -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{ "roomNo": "101", "state": "on", "process": "Visiting", "username": "fo_reception1" }'
```

Same pattern — configure a short auto-cutoff (e.g. 10–15 min) for Visiting in PowerHub, or send OFF explicitly when the visit ends.

### 4.7 Guest asks for an extra load mid-stay (e.g. turn on Geyser)

```bash
curl -X POST .../commands -H "X-API-Key: phk_XXXX" -H "Content-Type: application/json" \
  -d '{ "roomNo": "101", "state": "on", "process": "Checkin", "controlTypes": ["Geyser"], "grcNo": "GRC-2026-0451", "username": "fo_reception1" }'
```

---

## 5. Important Behaviour Notes

1. **Asynchronous by design** — `202` means *queued*, not *applied*. The relay box picks it up on its next poll (normally within 4–10 s). Do not block the MHMS UI waiting for the physical switch.
2. **Idempotent-safe** — sending ON to an already-ON control is harmless; the device re-applies its full state.
3. **Process names are per-property masters** — they must exist in PowerHub → Process master for that hotel (e.g. `Checkin`, `Checkout`, `Cleaning`, `Maintenance`, `Visiting`). An unknown name returns `400`. Agree on the exact names with the PowerHub admin before go-live.
4. **Control type names** (`Light`, `AC`, `Plug`, `Geyser`, …) are also per-property masters — matching is case-insensitive.
5. **Auto-cutoff** — processes flagged auto-cutoff in PowerHub switch OFF by themselves after the configured minutes. MHMS can rely on this for Cleaning/Visiting.
6. **Reporting** — every ON→OFF cycle records a consumption session (kWh + cost) tagged with `grcNo`/`billNo`/`guestName`, viewable in PowerHub reports. Always pass `grcNo` for guest events so billing reconciliation works.
7. **One API key per property** — for a hotel group, each hotel gets its own key; use the right key for the right property.
8. **Timeout/retry** — use a 15 s HTTP timeout; on network failure retry up to 2 times. Duplicate deliveries are safe (see note 2).

---

## 6. Quick Test Checklist (before go-live)

- [ ] Obtain the property's API key from the PowerHub admin.
- [ ] Confirm process master names configured in PowerHub match what MHMS will send.
- [ ] `POST` a Check-in ON to a test room → expect `202` and physical switch-on within ~10 s.
- [ ] `POST` a Checkout OFF → all loads switch off; session appears in PowerHub report with the GRC number.
- [ ] Test room transfer (OFF room A + ON room B).
- [ ] Test an unknown room number → expect `404` and correct error handling in MHMS.
- [ ] Test with a wrong API key → expect `401`.

---

## 7. Support

For API keys, process/control master configuration, or troubleshooting, contact the PowerHub administrator. Device-level status (online/offline, last-seen, live IP) is visible in PowerHub → Devices.
