---
name: Replit-managed Clerk key recovery
description: What to do when CLERK_SECRET_KEY (or publishable keys) get overwritten/corrupted in a Replit-managed Clerk app
---

# Replit-managed Clerk key recovery

Replit-managed Clerk secret/publishable keys **cannot be manually restored** if
overwritten in the Secrets pane — they are auto-provisioned and not exposed in
any Clerk dashboard. The managed instance also can't be self-hosted.

**Recovery:** call `setupClerkWhitelabelAuth()` (via CodeExecution). It is
idempotent, preserves the existing Clerk tenant, and re-writes correct values
for `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`.
Then restart BOTH the api-server and the web workflow so they pick up the new
keys (the web app needs the refreshed `VITE_CLERK_PUBLISHABLE_KEY`).

**Why:** a valid dev secret looks like `sk_test_...` (~51 chars). If a
`requestSecrets`/"add secret" dialog is answered with the wrong text (e.g. an
email), it silently overwrites the real key and every Clerk API call returns
`clerk_key_invalid`. Verify with `printenv CLERK_SECRET_KEY | cut -c1-8`.

**How to apply:** never route a Clerk-managed key through `requestSecrets` or
`setEnvVars` — those are for user-supplied secrets. To create/seed a Clerk user
programmatically, use `clerkClient` from `@clerk/express`
(`users.createUser` / `users.updateUser` with `skipPasswordChecks: true`),
run from within the api-server package (bundle with esbuild — there is no tsx,
and `node --experimental-strip-types` fails on the workspace's directory
imports). The app auto-provisions the matching `app_users` row on first login
and makes the very first user a super admin.
