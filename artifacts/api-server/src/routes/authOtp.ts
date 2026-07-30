// ---------------------------------------------------------------------------
// Public auth helpers — no Clerk session required:
//   POST /api/auth/otp/request   — generate & send WhatsApp OTP
//   POST /api/auth/otp/verify    — verify OTP → Clerk sign-in ticket
//   GET  /api/auth/reset/check   — check if email is eligible for password reset
// ---------------------------------------------------------------------------
import { Router, type IRouter } from "express";
import { and, eq, gt, isNull, count } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, appUsersTable, otpTokensTable, systemSettingsTable } from "@workspace/db";
import { sendWhatsAppOtp } from "../lib/whatsapp";
import { SETTINGS_ID } from "../lib/settings";

const router: IRouter = Router();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Rate-limit: max 3 OTP requests per email in 5 minutes
async function isRateLimited(email: string): Promise<boolean> {
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await db
    .select({ c: count() })
    .from(otpTokensTable)
    .where(
      and(
        eq(otpTokensTable.email, email),
        gt(otpTokensTable.createdAt, since),
      ),
    );
  return (rows[0]?.c ?? 0) >= 3;
}

// POST /api/auth/otp/request
router.post("/otp/request", async (req, res) => {
  const { email, purpose = "login" } = req.body as { email?: string; purpose?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();

  // Look up user
  const users = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.email, normalizedEmail))
    .limit(1);
  const user = users[0];

  if (!user) {
    // Don't reveal whether the email exists
    res.json({ sent: true });
    return;
  }

  if (!user.phone) {
    res.status(400).json({
      error: "No WhatsApp number registered for this account. Contact your administrator.",
    });
    return;
  }

  // Block password reset for super-admin
  if (purpose === "reset" && user.isSuperAdmin) {
    res.status(403).json({
      error: "Super-admin password reset must be done directly on the server.",
    });
    return;
  }

  // Rate limit
  if (await isRateLimited(normalizedEmail)) {
    res.status(429).json({ error: "Too many OTP requests. Please wait 5 minutes." });
    return;
  }

  // Load WhatsApp settings
  const settings = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  const s = settings[0];
  if (!s?.waOtpEnabled || !s.waApiUrl || !s.waApiKey || !s.waPhoneNumberId) {
    res.status(503).json({ error: "WhatsApp OTP is not configured. Contact your administrator." });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpTokensTable).values({
    email: normalizedEmail,
    code,
    purpose,
    expiresAt,
  });

  const result = await sendWhatsAppOtp(s.waApiUrl, s.waApiKey, s.waPhoneNumberId, user.phone, code);
  if (!result.ok) {
    res.status(502).json({ error: "Failed to send WhatsApp message. Please try email instead." });
    return;
  }

  // Mask phone for display: keep last 4 digits
  const maskedPhone = user.phone.replace(/\d(?=\d{4})/g, "*");
  res.json({ sent: true, maskedPhone });
});

// POST /api/auth/otp/verify
router.post("/otp/verify", async (req, res) => {
  const { email, code, purpose = "login" } = req.body as {
    email?: string;
    code?: string;
    purpose?: string;
  };
  if (!email || !code) {
    res.status(400).json({ error: "email and code are required" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  // Find a valid, unused OTP
  const tokens = await db
    .select()
    .from(otpTokensTable)
    .where(
      and(
        eq(otpTokensTable.email, normalizedEmail),
        eq(otpTokensTable.code, code.trim()),
        eq(otpTokensTable.purpose, purpose),
        gt(otpTokensTable.expiresAt, now),
        isNull(otpTokensTable.usedAt),
      ),
    )
    .limit(1);

  if (!tokens[0]) {
    res.status(401).json({ error: "Invalid or expired OTP. Please request a new one." });
    return;
  }

  // Mark as used
  await db
    .update(otpTokensTable)
    .set({ usedAt: now })
    .where(eq(otpTokensTable.id, tokens[0].id));

  // Look up user
  const users = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.email, normalizedEmail))
    .limit(1);
  const user = users[0];
  if (!user || !user.clerkUserId) {
    res.status(404).json({ error: "User account not found." });
    return;
  }

  if (purpose === "login") {
    // Create a Clerk sign-in token (valid for 1 minute)
    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: user.clerkUserId,
      expiresInSeconds: 60,
    });
    res.json({ ticket: signInToken.token });
  } else {
    // For password reset: just confirm verification so the frontend can proceed
    res.json({ verified: true, email: normalizedEmail });
  }
});

// GET /api/auth/wa-status — public: tells the login screen whether WA OTP is configured
router.get("/wa-status", async (_req, res) => {
  const settings = await db
    .select({
      waOtpEnabled: systemSettingsTable.waOtpEnabled,
      waApiUrl: systemSettingsTable.waApiUrl,
      waApiKey: systemSettingsTable.waApiKey,
      waPhoneNumberId: systemSettingsTable.waPhoneNumberId,
    })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  const s = settings[0];
  const enabled = !!(s?.waOtpEnabled && s.waApiUrl && s.waApiKey && s.waPhoneNumberId);
  res.json({ enabled });
});

// GET /api/auth/reset/check?email=
router.get("/reset/check", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.toLowerCase().trim() : "";
  if (!email) {
    res.status(400).json({ error: "email query param required" });
    return;
  }
  const users = await db
    .select({ isSuperAdmin: appUsersTable.isSuperAdmin, active: appUsersTable.active })
    .from(appUsersTable)
    .where(eq(appUsersTable.email, email))
    .limit(1);
  const user = users[0];
  if (!user || !user.active) {
    // Don't reveal existence — treat as eligible
    res.json({ eligible: true });
    return;
  }
  if (user.isSuperAdmin) {
    res.json({ eligible: false, reason: "Super-admin accounts cannot use self-service password reset. Please contact the system administrator." });
    return;
  }
  res.json({ eligible: true });
});

export default router;
