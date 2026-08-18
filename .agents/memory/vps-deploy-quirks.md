---
name: VPS deploy quirks
description: Hostinger VPS production environment gotchas — no shell DB access, PM2 cluster env hidden, startup seed-sync pattern
---

# VPS production deploy quirks

- On the user's VPS there is **no usable `DATABASE_URL` in any shell context**: no `.env` in /var/www/powerhub, `pm2 env`, `pm2 jlist`, and `/proc/<pid>/environ` all lack it (PM2 cluster mode injects env after fork). Manual `psql` data fixes on prod are effectively impossible for the user.
- **Why:** wasted a long back-and-forth trying to run one UPDATE via psql.
- **How to apply:** any prod data/permission migration must ship *inside the app* — put idempotent sync SQL in `seedSystemRoles()` (runs at api-server startup) or similar, then user just pulls + builds + `pm2 restart powerhub-api`. Never hand the user raw psql commands for prod.
- gitPush can report success while origin/main stays behind (happened twice). After EVERY push, verify with `git fetch origin main && git merge-base --is-ancestor HEAD origin/main`; re-push if behind. Symptom: user deploys honestly but the fix "isn't working".
- Schema changes still need attention: drizzle push is dev-only; new columns must be added idempotently too (prefer `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` via startup code or the pending auto-migration task).

## Direct SSH access (working)
- Agent can SSH from the workspace: `sshpass -e ssh root@$VPS_HOST` using secrets VPS_HOST / VPS_USER / VPS_ROOT_PASSWORD (Hostinger, srv1163666).
- Deploy = push workspace main to GitHub (`git push https://x-access-token:$GITHUB_PAT@github.com/MicrogennSenthil/PowerHub.git main` — workspace has no github remote, only gitsafe backup), then on VPS: git pull, pnpm install, build powerhub + api-server, `pm2 restart powerhub-api`.
- `pm2 env <id>` output is polluted by a version-mismatch banner and unreliable for grabbing DATABASE_URL; read it from `/var/www/powerhub/artifacts/api-server/.env` instead.
