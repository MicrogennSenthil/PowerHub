import assert from "node:assert/strict";
import test from "node:test";
import { hmsProcessEvent, parseHmsOccupancyBody } from "./hmsOccupancy";

test("accepts a valid JSON occupancy response", () => {
  assert.deepEqual(
    parseHmsOccupancyBody(
      JSON.stringify({
        rooms: [
          {
            roomNumber: "205",
            status: "Checkin",
            grcNo: "GRC/001",
            guestName: "Guest One",
          },
        ],
      }),
      "application/json; charset=utf-8",
    ),
    {
      ok: true,
      rooms: [
        {
          roomNumber: "205",
          status: "Checkin",
          grcNo: "GRC/001",
          guestName: "Guest One",
        },
      ],
    },
  );
});

test("rejects an HTTP 200 HTML page with a clear message", () => {
  const result = parseHmsOccupancyBody(
    "<!DOCTYPE html><html><title>M-HMS</title></html>",
    "text/html; charset=UTF-8",
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /web page instead of occupancy data/i);
});

test("rejects non-JSON and malformed JSON contracts", () => {
  const text = parseHmsOccupancyBody("Service unavailable", "text/plain");
  assert.equal(text.ok, false);
  assert.match(text.ok ? "" : text.error, /invalid response/i);

  const missingRooms = parseHmsOccupancyBody('{"status":"ok"}', "application/json");
  assert.equal(missingRooms.ok, false);
  assert.match(missingRooms.ok ? "" : missingRooms.error, /missing the rooms list/i);
});

test("preserves an unmatched HMS status as a real process event", () => {
  assert.equal(hmsProcessEvent(" Checkin "), "Checkin");
  assert.equal(hmsProcessEvent("  "), null);
});