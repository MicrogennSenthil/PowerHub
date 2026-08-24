export interface HmsOccupancyRoom {
  roomNumber: string;
  status: string;
  grcNo?: string;
  guestName?: string;
  billNo?: string;
}

export type HmsOccupancyParseResult =
  | { ok: true; rooms: HmsOccupancyRoom[] }
  | { ok: false; error: string };

function looksLikeHtml(body: string): boolean {
  const start = body.trimStart().slice(0, 100).toLowerCase();
  return start.startsWith("<!doctype html") || start.startsWith("<html");
}

export function hmsProcessEvent(status: string): string | null {
  const event = String(status ?? "").trim();
  return event || null;
}

export function parseHmsOccupancyBody(
  body: string,
  contentType: string | null,
): HmsOccupancyParseResult {
  if (contentType?.toLowerCase().includes("text/html") || looksLikeHtml(body)) {
    return {
      ok: false,
      error:
        "MHMS returned its web page instead of occupancy data. Check the MHMS Server URL and ensure the M-HMS occupancy API is deployed.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      ok: false,
      error:
        "MHMS returned an invalid response instead of JSON occupancy data. Check the MHMS Server URL.",
    };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { rooms?: unknown }).rooms)
  ) {
    return {
      ok: false,
      error: "MHMS occupancy response is missing the rooms list.",
    };
  }

  const rooms = (parsed as { rooms: unknown[] }).rooms.filter(
    (room): room is HmsOccupancyRoom =>
      typeof room === "object" &&
      room !== null &&
      typeof (room as HmsOccupancyRoom).roomNumber === "string" &&
      typeof (room as HmsOccupancyRoom).status === "string",
  );
  return { ok: true, rooms };
}