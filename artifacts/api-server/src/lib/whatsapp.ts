// ---------------------------------------------------------------------------
// WhatsApp OTP delivery via mwhatsapp platform
// POST {waApiUrl}/api/messages/send
// Header: x-api-key: <waApiKey>
// ---------------------------------------------------------------------------
import { logger } from "./logger";

export interface WaSendResult {
  ok: boolean;
  error?: string;
}

export async function sendWhatsAppOtp(
  waApiUrl: string,
  waApiKey: string,
  waPhoneNumberId: string,
  toPhone: string,
  otp: string,
): Promise<WaSendResult> {
  const url = `${waApiUrl.replace(/\/+$/, "")}/api/messages/send`;
  // Normalize phone: strip spaces/dashes, ensure country code present
  const phone = toPhone.replace(/[\s\-()]/g, "");
  const message =
    `🔐 *PowerHub OTP*\n\nYour one-time password is:\n\n*${otp}*\n\n` +
    `This code expires in 10 minutes. Do not share it with anyone.`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": waApiKey,
      },
      body: JSON.stringify({
        phoneNumberId: waPhoneNumberId,
        messageType: "text",
        recipients: [phone],
        customText: message,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ url, status: res.status, body }, "WhatsApp OTP send failed");
      return { ok: false, error: `WhatsApp API error ${res.status}` };
    }
    logger.info({ phone }, "WhatsApp OTP sent");
    return { ok: true };
  } catch (err: any) {
    logger.warn({ url, err: err?.message }, "WhatsApp OTP network error");
    return { ok: false, error: err?.message ?? "Network error" };
  }
}
