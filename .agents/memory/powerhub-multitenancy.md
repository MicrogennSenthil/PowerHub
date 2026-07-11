---
name: PowerHub multi-tenant integrity rules
description: Isolation and RBAC invariants for the PowerHub hotel power-automation API that code review must keep enforced.
---

# PowerHub multi-tenant integrity

The API is multi-tenant, keyed by `propertyId`. Access is gated by `canAccessProperty`
(super admins bypass; everyone else limited to their allocated `propertyIds`).

## Rules that must stay enforced

- **Cross-property foreign keys must be validated.** On any property-scoped
  create/update, every foreign id (e.g. `blockId`, `floorId`, `roomTypeId`,
  `roomId`, `controlTypeId`) must be confirmed to belong to the *same* property as
  the parent row — use `lib/integrity.ts` `refBelongsToProperty`. A valid
  `canAccessProperty` check on the parent is NOT enough; without the ref check a
  user can link/leak rows from another tenant via joins.
  **Why:** code review found rooms/devices/controls accepted foreign ids from any
  property, exposing other tenants' data through the response joins.

- **`isSuperAdmin` is super-admin-only to mutate.** User create/update must reject
  (403) any attempt by a non-super-admin to set `isSuperAdmin`, and must never
  persist it from a non-super-admin actor.
  **Why:** `users.manage` alone previously allowed privilege escalation to global
  super admin.

- **First-user bootstrap must be atomic.** The "first user becomes super admin"
  path in `lib/auth.ts` wraps count+insert in a transaction guarded by
  `pg_advisory_xact_lock` so concurrent first logins can't mint two super admins.

- **Settings/config endpoints must not disclose stored secrets.** A `*.view`
  read permission returning a stored credential (e.g. `mqttPassword`) leaks it to
  read-only roles. Return a boolean like `mqttPasswordSet` instead, keep the
  secret write-only, and only overwrite it when a non-empty value is supplied.
  **Why:** code review flagged `settings.view` users could read the MQTT broker
  password in plaintext.

- **Device online/offline threshold must be applied uniformly.** Any surface that
  derives device online status (device list, device detail, dashboard summary +
  its embedded device list) must use the single configured
  `offlineThresholdMinutes` (via `getOfflineThresholdMinutes`), not a hardcoded
  default — otherwise endpoints disagree on the same device's status.

## Branding / Smart TV (no-hardware TV logo)
- Consumer smart TVs (Samsung/LG/Sony) **cannot** have their power-on boot logo
  changed by any third-party software/USB — it's in signed manufacturer firmware.
  Only hospitality TVs (Samsung Hospitality/LYNK, LG Pro:Centric) support a USB
  welcome-logo, or a media box per room. User declined hardware, so we ship:
  in-app branding + a castable `/welcome` page + a client-generated 1920×1080 USB
  image. None auto-shows at power-on; that limit is inherent, not a bug.
- Branding (logo/name/colour) lives in the `system_settings` singleton and is
  read via a **public** `GET /branding` (mounted before `requireAuth`) because the
  login screen and castable TV page render unauthenticated. **Rule:** that public
  serializer must expose ONLY brandName/brandColor/brandLogoUrl — never spread the
  whole settings row, or you leak mqtt secrets. Writes gated by `smartTv.manage`.
- Logos are stored as **downscaled PNG data URLs** in the DB (no object storage).
  This requires raising `express.json({ limit })` above the 100kb default (set to
  2mb) or uploads 413. Downscale client-side (~320px) + cap/validate server-side.

## Property code uniqueness (manual/auto)
- Property `code` is either admin-typed ("manual") or auto-generated
  (`<prefix>-NNN`) depending on `system_settings.propertyCodeMode` (Software Setup
  page). **Rule:** the case-insensitive DB unique index on `lower(code)` is the
  source of truth — app-level duplicate checks are only for friendly errors.
  Translate Postgres `23505` into a 409. Auto-generation guesses `max+1` then
  must **retry on 23505** (concurrent inserts race the guess); never trust a
  scan-and-increment alone.

## Room occupancy / power status is derived, not stored
- There is **no** occupancy or per-room power column. The Room Chart and any
  "room is occupied / powered on" indicator derive status from control state:
  a room is "power on" when any of its mapped `controls.state != 0`, and a
  control indicator is green=on / red=off / muted when its driving device is
  offline (device `last_seen_at` vs `offlineThresholdMinutes`).
  **Why:** legacy relay hardware reports channel state, not guest occupancy.
  **How to apply:** don't invent an `occupied` field; join controls→control_types
  →devices and compute. Controls with `room_id IS NULL` aren't shown per-room.

## Device communication protocol (config-switchable)
- Direction agreed with user: **run legacy HTTP-poll now, keep MQTT as a stored,
  UI-switchable setting** (global singleton `system_settings`, super-admin/
  `settings.manage` gated). Existing ESP32 firmware is HTTP-poll and its source is
  unavailable, so MQTT will require brand-new firmware — treated as a later phase.
- Hardware note to resolve before building the device layer: the box has TWO MCUs
  (ESP32 for WiFi + a motherboard MCU that talks HMS and drives relays); need to
  confirm their wiring and which one holds the server connection.

## Stack gotcha
- `validateBody` and any generic wrapper over `@workspace/api-zod` schemas must use
  `<T extends z.ZodTypeAny>` + `z.infer<T>`, NOT `ZodType<T>` — positional generic
  inference collapses the body type to `{}` across package boundaries.
