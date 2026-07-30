---
name: WhatsApp OTP Auth Flow
description: Custom sign-in page + mwhatsapp OTP design decisions, API contract, and superadmin restrictions.
---

## Custom Sign-in Page (CustomSignIn.tsx)
Replaced Clerk's `<SignIn>` component entirely. Uses `useSignIn` hook.
- Step 1: email entry
- Step 2: password (with "Forgot password?" + "Sign in with WhatsApp OTP")
- Forgot password: checks `/api/auth/reset/check` first → blocked for superadmin → uses Clerk `reset_password_email_code` strategy
- WhatsApp OTP: calls `/api/auth/otp/request` → user enters code → `/api/auth/otp/verify` returns Clerk `signInToken.token` → `signIn.create({ strategy: 'ticket', ticket })` completes the session

## mwhatsapp API Contract
- POST `{waApiUrl}/api/messages/send`
- Header: `x-api-key: {waApiKey}`
- Body: `{ phoneNumberId, messageType: "text", recipients: [phone], customText }`
- `phoneNumberId` = the sending number's ID from mwhatsapp dashboard (stored in system_settings.wa_phone_number_id)
- Phone format: digits only with country code, no spaces/dashes (e.g. "919876543210")

## Superadmin Reset Block
`GET /api/auth/reset/check?email=` returns `{ eligible: false, reason: "..." }` for isSuperAdmin=true users.
The frontend shows the reason and does NOT proceed to Clerk reset.

**Why:** Superadmin accounts have no property scope; a compromised reset would give full system access.

## Backend Routes (public — no Clerk session required)
- `POST /api/auth/otp/request` — rate-limited 3/5min per email, generates 6-digit OTP, stores in `otp_tokens`, sends WA
- `POST /api/auth/otp/verify` — checks otp_tokens (unused, unexpired), marks used, creates Clerk signInToken via `clerkClient.signInTokens.createSignInToken({ userId, expiresInSeconds: 60 })`
- `GET /api/auth/reset/check` — eligibility check (does not reveal whether email exists for eligible case)

## Clerk Sign-in Token (ticket)
`clerkClient.signInTokens.createSignInToken` requires the user's `clerkUserId` from `app_users`. Token expires in 60s. Frontend completes with `signIn.create({ strategy: 'ticket', ticket: token })`.

## Phone Field
`app_users.phone` — nullable text, stores WhatsApp number with country code. Set per-user in Users management page. Required for WA OTP; returns 400 if user has no phone registered.

## WA Settings
Stored in `system_settings` (singleton id=1): `wa_api_url`, `wa_api_key`, `wa_phone_number_id`, `wa_otp_enabled`. API key is write-only (never returned; `wa_api_key_set` boolean is returned instead). Toggle `wa_otp_enabled` controls whether the WA OTP button appears.
