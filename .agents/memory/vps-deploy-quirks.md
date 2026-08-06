---
name: VPS deploy quirks
description: Hostinger VPS production environment gotchas — no shell DB access, PM2 cluster env hidden, startup seed-sync pattern
---

# VPS production deploy quirks

- On the user's VPS there is **no usable `DATABASE_URL` in any shell context**: no `.env` in /var/www/powerhub, `pm2 env`, `pm2 jlist`, and `/proc/<pid>/environ` all lack it (PM2 cluster mode injects env after fork). Manual `psql` data fixes on prod are effectively impossible for the user.
- **Why:** wasted a long back-and-forth trying to run one UPDATE via psql.
- **How to apply:** any prod data/permission migration must ship *inside the app* — put idempotent sync SQL in `seedSystemRoles()` (runs at api-server startup) or similar, then user just pulls + builds + `pm2 restart powerhub-api`. Never hand the user raw psql commands for prod.
- Schema changes still need attention: drizzle push is dev-only; new columns must be added idempotently too (prefer `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` via startup code or the pending auto-migration task).
