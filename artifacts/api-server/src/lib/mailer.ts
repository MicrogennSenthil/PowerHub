import nodemailer from "nodemailer";
import type { SystemSettingsRow } from "@workspace/db";

export interface MailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(
  settings: SystemSettingsRow,
  opts: MailOptions,
): Promise<void> {
  if (
    !settings.alertEmailEnabled ||
    !settings.smtpHost ||
    !settings.smtpUser ||
    !settings.smtpPassword ||
    !settings.smtpFrom
  ) {
    return; // Email not configured — silently skip
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    secure: (settings.smtpPort ?? 587) === 465,
    auth: { user: settings.smtpUser, pass: settings.smtpPassword },
  });

  await transporter.sendMail({
    from: settings.smtpFrom,
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
