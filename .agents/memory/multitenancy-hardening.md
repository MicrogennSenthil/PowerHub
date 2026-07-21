---
name: Multi-tenancy hardening
description: How property-scoped roles, billing, and user isolation work in PowerHub
---

# Multi-tenancy hardening decisions

- **Roles are property-scoped**: `roles.property_id` FK added (nullable — legacy global rows left as NULL). Every `GET/POST/PATCH/DELETE /roles` now requires and enforces `propertyId`. Frontend passes `selectedPropertyId` from PropertyContext.
- **Default roles seeded on property creation**: `seedDefaultRoles(propertyId)` called inside `POST /properties` after insert. Seeds Administrator, Manager, Receptionist, Housekeeping, Viewer as `isSystem=true` for each new property. Defined in `DEFAULT_PROPERTY_ROLES` in `permissions.ts` (renamed from SYSTEM_ROLES). `seedSystemRoles()` in `seed.ts` is now a no-op (kept for backward compat with startup).
- **Drizzle push gotcha**: adding a UNIQUE constraint to a non-empty table prompts interactively — apply via direct SQL first (`ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`), then push becomes a no-op.
- **Billing on properties**: `plan_tier` (trial/starter/pro), `billing_status` (trial/active/suspended), `max_users`, `max_devices`, `trial_ends_at`, `next_billing_at` added. `property_invoices` table for manual billing history.
- **Admin panel**: `GET/PATCH /admin/properties` + `GET/POST /admin/properties/:id/invoices` — super-admin only (checked via `requireSuperAdmin` middleware inside the router, before `requireAuth` order doesn't matter since requireAuth is mounted globally first). Frontend: `src/pages/admin/PropertyManagement.tsx`.
- **User isolation**: `GET /users` now filters to users sharing at least one property with the caller (non-super-admins). Super admins see all.
- **Quota enforcement**: NOT YET DONE — maxUsers/maxDevices stored but not enforced at API level (follow-up task #2).
- **Why**: user confirmed each property = one tenant, same URL for all, super admin creates properties manually.
