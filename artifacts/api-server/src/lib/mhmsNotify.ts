// ---------------------------------------------------------------------------
// MHMS outbound notification helper
// PowerHub → M-HMS: inform MHMS of power state changes so their room chart
// can update icon/colour in real time.
//
// Endpoint (agreed with MHMS team):
//   POST {mhmsApiUrl}/api/integration/power/status
//   Header: X-API-Key: <key>
//
// The call is fire-and-forget — failures are logged but never bubble up to
// the caller so the relay command always completes.
// ---------------------------------------------------------------------------

import { logger } from "./logger";

export interface MhmsStatusPayload {
  roomNumber: string;
  action: "ON" | "OFF";
  event: string;           // e.g. "auto-cutoff", "checkin", "checkout"
  hotelId?: string | null;
  grcNo?: string | null;
  guestName?: string | null;
  timestamp: string;       // ISO 8601
}

export async function notifyMhms(
  mhmsApiUrl: string,
  mhmsApiKey: string,
  payload: MhmsStatusPayload,
): Promise<void> {
  const url = `${mhmsApiUrl.replace(/\/+$/, "")}/api/integration/power/status`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": mhmsApiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.warn(
        { url, status: res.status, room: payload.roomNumber, event: payload.event },
        "MHMS status notification returned non-2xx",
      );
    } else {
      logger.info(
        { room: payload.roomNumber, event: payload.event },
        "MHMS status notification sent",
      );
    }
  } catch (err: any) {
    logger.warn(
      { url, room: payload.roomNumber, err: err?.message },
      "MHMS status notification failed (network)",
    );
  }
}
