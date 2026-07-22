# M-HMS × PowerHub Integration API
**Document version: 1.1 — July 2026**  
**PowerHub Production URL: https://power.microgenn.com**  
**M-HMS Production URL: https://mhms.microgenn.com**

---

## Overview

PowerHub and M-HMS exchange data over two REST channels using a **shared API key** agreed between both teams.

| Direction | Who calls | Purpose |
|---|---|---|
| M-HMS → PowerHub | M-HMS (outbound) | Send ON/OFF power commands at guest lifecycle events |
| PowerHub → M-HMS | PowerHub (outbound) | Pull the hotel room master list for import |
| PowerHub → M-HMS | PowerHub (outbound) | **Notify M-HMS when auto-cutoff fires** *(new in v1.1)* |

---

## Authentication

Every request in **both directions** must include the header:

```
X-API-Key: <shared-api-key>
```

- Missing or invalid key → **401 Unauthorized**
- The key is configured once in M-HMS under **Configuration → Power Automation**
- The same key must be entered in PowerHub under **Facility → Properties → Edit → MHMS Integration**

---

## 1. M-HMS → PowerHub: Send Power Command

M-HMS calls this endpoint on guest lifecycle events (check-in, checkout, etc.).

### Request

```
POST https://power.microgenn.com/api/integration/power/commands
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "roomNumber": "101",
  "action": "ON",
  "controlTypes": ["Light", "AC"],
  "event": "checkin",
  "hotelId": "28fe7680-d1b4-45ae-9949-26f226c3d865",
  "grcNo": "GRC/001/26-27/0000001",
  "guestName": "John Doe",
  "timestamp": "2026-07-22T10:30:00+05:30"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `roomNumber` | string | ✅ | Hotel room number (e.g. "101") |
| `action` | `"ON"` \| `"OFF"` | ✅ | Power action |
| `controlTypes` | string[] | ❌ | Specific control types to switch (e.g. `["Light","AC"]`). Omit or send empty `[]` to switch **all controls** in the room |
| `event` | string | ❌ | Lifecycle event name: `checkin`, `walkin`, `checkout`, `cleaning`, `visiting`, `transfer` |
| `hotelId` | string | ❌ | M-HMS hotel identifier |
| `grcNo` | string | ❌ | Guest registration card number |
| `guestName` | string | ❌ | Guest name (used for audit trail display in PowerHub) |
| `timestamp` | string | ❌ | ISO 8601 timestamp with hotel timezone offset |

### Response

```
HTTP 202 Accepted
```

```json
{
  "queued": 2,
  "room": "101",
  "action": "ON",
  "event": "checkin"
}
```

> **Note:** PowerHub responds `202` immediately — the relay box may take up to a few seconds to physically execute the command on its next poll cycle.

### Events that trigger power commands

| M-HMS Event | `action` | Notes |
|---|---|---|
| Check-in | `ON` | Standard and walk-in check-in |
| Group check-in / walk-in | `ON` | Send one request per room |
| Room transfer | `ON` (new room) + `OFF` (old room) | Send two separate requests |
| Checkout | `OFF` | Immediate or deferred to settlement |
| Cleaning | `ON` | Recommend `controlTypes: ["Light"]` only |
| Visiting | `ON` | Auto-cutoff handles the OFF after visit ends |

### Error Responses

| HTTP Code | Meaning |
|---|---|
| 401 | Missing, empty, or invalid `X-API-Key` |
| 404 | Room number not found in PowerHub |
| 400 | No controls mapped to the room, or unknown control type |
| 500 | Internal server error |

Non-2xx responses should be logged by M-HMS and retried for deferred cutoff events.

---

## 2. PowerHub → M-HMS: Pull Room Master List

PowerHub calls this endpoint to import all active rooms into its master.

### Request

```
GET https://mhms.microgenn.com/api/integration/power/rooms
X-API-Key: <api-key>
```

### Response

```json
{
  "hotelId": "28fe7680-d1b4-45ae-9949-26f226c3d865",
  "hotelName": "GM Residency",
  "rooms": [
    {
      "roomNumber": "101",
      "roomType": "Standard",
      "block": "Main Block",
      "floor": "First Floor"
    },
    {
      "roomNumber": "106",
      "roomType": "Deluxe",
      "block": "Main Block",
      "floor": "First Floor"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `hotelId` | string | M-HMS hotel identifier |
| `hotelName` | string | Hotel name |
| `rooms[].roomNumber` | string | Room number |
| `rooms[].roomType` | string \| null | Room type name |
| `rooms[].block` | string \| null | Block name |
| `rooms[].floor` | string \| null | Floor name |

Only **active** rooms should be returned. Deactivated or removed rooms must be excluded.

---

## 3. PowerHub → M-HMS: Auto-Cutoff Status Notification *(New — v1.1)*

When PowerHub's auto-cutoff engine switches off a room's power (e.g. after a visiting period or cleaning session expires), it **immediately notifies M-HMS** so the M-HMS room chart can update its icon and colour in real time.

### M-HMS must implement this endpoint

```
POST https://mhms.microgenn.com/api/integration/power/status
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "roomNumber": "101",
  "action": "OFF",
  "event": "auto-cutoff",
  "grcNo": "GRC/001/26-27/0000001",
  "guestName": "John Doe",
  "timestamp": "2026-07-22T12:30:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `roomNumber` | string | Room number that was switched off |
| `action` | `"OFF"` | Always `"OFF"` for auto-cutoff notifications |
| `event` | string | Always `"auto-cutoff"` for this notification type |
| `grcNo` | string \| null | GRC number of the original check-in/visit command, if available |
| `guestName` | string \| null | Guest name of the original command, if available |
| `timestamp` | string | ISO 8601 UTC timestamp of when the cutoff was executed |

### Expected Response from M-HMS

```
HTTP 200 OK   (or any 2xx)
```

> **Important:** PowerHub fires this call **fire-and-forget** — it does not block the cutoff on a response. If M-HMS is unreachable, PowerHub logs a warning and continues. However, M-HMS must implement this endpoint so the room chart icon and colour reflect the correct OFF state without waiting for the next manual refresh.

### Suggested M-HMS behaviour on receiving this notification

On receiving `action: "OFF"` + `event: "auto-cutoff"`:
- Update the room's power status indicator to **OFF / Standby**
- Change the room card colour from **green (occupied/live)** to **grey/red (standby)**
- Update the icon to reflect no active power load
- Log the auto-cutoff event in the M-HMS audit trail for the GRC

---

## Setup (One-Time Configuration)

### In M-HMS
1. Log in → **Configuration → Power Automation**
2. Fill in:
   - **PowerHub Base URL**: `https://power.microgenn.com`
   - **API Key**: shared key agreed with PowerHub team
3. Enable **Power Automation**
4. Click **Save**
5. Use **Test Connection** (enter a room number, click **Test Power ON**) to verify

### In PowerHub
1. Log in → **Facility → Properties** → Edit the property
2. Scroll to **MHMS Integration** section
3. Fill in:
   - **MHMS Server URL**: `https://mhms.microgenn.com`
   - **MHMS API Key**: same shared key
4. Click **Save Property**
5. Go to **Facility → Rooms** → click **Import from MHMS** to pull the room master list

---

## Staging / Test Environment

For testing before going live, use the staging M-HMS server:

| | URL |
|---|---|
| M-HMS Staging | `https://stagmhms.microgenn.com` |
| PowerHub Production | `https://power.microgenn.com` |

Authentication and all endpoints are identical to production. The same API key works on both environments.

---

## Companion Bridge (On-Premises Relay Boxes)

If the hotel's relay boxes (ESP32 firmware) are on a local LAN and cannot reach `power.microgenn.com` directly, install the **PowerHub Companion Bridge** on any always-on PC at the hotel.

**Download:** Log in to PowerHub → **Integration → Power Automation** → click **Download Bridge**

The bridge accepts plain HTTP from the relay boxes and forwards it to PowerHub over HTTPS. No firewall changes are needed on the PowerHub side.

---

## Contact

| Team | Contact |
|---|---|
| PowerHub / MicroGenn | power.microgenn.com |
| M-HMS | mhms.microgenn.com |

*Document version 1.1 — July 2026. Supersedes v1.0.*
