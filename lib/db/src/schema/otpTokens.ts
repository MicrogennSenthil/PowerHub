import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Short-lived OTP tokens used for WhatsApp-based login and password reset.
// One row per attempt; used rows are never deleted (audit trail).
export const otpTokensTable = pgTable("otp_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  purpose: text("purpose").notNull().default("login"), // "login" | "reset"
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OtpTokenRow = typeof otpTokensTable.$inferSelect;
