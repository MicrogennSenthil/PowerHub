import { Router, type IRouter } from "express";
import { eq, and, ne, gte, sql } from "drizzle-orm";
import {
  db,
  blocksTable,
  floorsTable,
  roomsTable,
  devicesTable,
  controlsTable,
  processTypesTable,
  powerSessionsTable,
} from "@workspace/db";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parsePropertyIdQuery } from "../lib/http";
import { isDeviceOnline, serializeDevice } from "../lib/serialize";
import { getOfflineThresholdMinutes } from "../lib/settings";

const router: IRouter = Router();

async function countWhere(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  where: any,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(where);
  return rows[0]?.count ?? 0;
}

router.get(
  "/summary",
  requirePermission("dashboard.view"),
  async (req, res) => {
    const propertyId = parsePropertyIdQuery(req);
    if (propertyId === null) {
      res.status(400).json({ error: "propertyId query param is required" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [
      blocks,
      floors,
      rooms,
      processTypes,
      controls,
      controlsOn,
      deviceRows,
      floorRows,
      channelRows,
    ] = await Promise.all([
      countWhere(blocksTable, eq(blocksTable.propertyId, propertyId)),
      countWhere(floorsTable, eq(floorsTable.propertyId, propertyId)),
      countWhere(roomsTable, eq(roomsTable.propertyId, propertyId)),
      countWhere(
        processTypesTable,
        eq(processTypesTable.propertyId, propertyId),
      ),
      countWhere(controlsTable, eq(controlsTable.propertyId, propertyId)),
      countWhere(
        controlsTable,
        and(
          eq(controlsTable.propertyId, propertyId),
          ne(controlsTable.state, 0),
        ),
      ),
      db.select().from(devicesTable).where(eq(devicesTable.propertyId, propertyId)),
      db
        .select({ id: floorsTable.id, name: floorsTable.name })
        .from(floorsTable)
        .where(eq(floorsTable.propertyId, propertyId)),
      db
        .select({
          deviceId: controlsTable.deviceId,
          count: sql<number>`count(*)::int`,
        })
        .from(controlsTable)
        .where(eq(controlsTable.propertyId, propertyId))
        .groupBy(controlsTable.deviceId),
    ]);

    const floorNames = new Map(floorRows.map((f) => [f.id, f.name]));
    const channelCounts = new Map(channelRows.map((c) => [c.deviceId, c.count]));
    const threshold = await getOfflineThresholdMinutes();
    const devicesOnline = deviceRows.filter((d) =>
      isDeviceOnline(d.lastSeenAt, threshold),
    ).length;

    res.json({
      propertyId,
      blocks,
      floors,
      rooms,
      devices: deviceRows.length,
      devicesOnline,
      devicesOffline: deviceRows.length - devicesOnline,
      controls,
      controlsOn,
      processTypes,
      devicesList: deviceRows.map((d) =>
        serializeDevice(d, {
          floorName: d.floorId ? (floorNames.get(d.floorId) ?? null) : null,
          channelCount: channelCounts.get(d.id) ?? 0,
          onlineThresholdMinutes: threshold,
        }),
      ),
    });
  },
);

// Last 7 days (including today) vs the previous 7 days.
// Sessions are attributed to the day they started; kWh uses the wattage
// snapshot and the elapsed time (open sessions count up to "now").
router.get(
  "/trends",
  requirePermission("dashboard.view"),
  async (req, res) => {
    const propertyId = parsePropertyIdQuery(req);
    if (propertyId === null) {
      res.status(400).json({ error: "propertyId query param is required" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const windowStart = new Date(startOfToday);
    windowStart.setDate(windowStart.getDate() - 6); // current: last 7 days
    const prevStart = new Date(windowStart);
    prevStart.setDate(prevStart.getDate() - 7); // previous 7-day window

    const rows = await db
      .select({
        roomId: powerSessionsTable.roomId,
        wattage: powerSessionsTable.wattage,
        startedAt: powerSessionsTable.startedAt,
        endedAt: powerSessionsTable.endedAt,
      })
      .from(powerSessionsTable)
      .where(
        and(
          eq(powerSessionsTable.propertyId, propertyId),
          gte(powerSessionsTable.startedAt, prevStart),
        ),
      );

    // Format using local calendar parts (no UTC round-trip, avoids date shift)
    const dayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    type Bucket = { sessions: number; kwh: number; rooms: Set<number> };
    const buckets = new Map<string, Bucket>();
    const totals = {
      current: { sessions: 0, kwh: 0, hours: 0, rooms: new Set<number>() },
      previous: { sessions: 0, kwh: 0, hours: 0, rooms: new Set<number>() },
    };

    for (const r of rows) {
      const started = new Date(r.startedAt);
      const ended = r.endedAt ? new Date(r.endedAt) : now;
      const hours = Math.max(0, (ended.getTime() - started.getTime()) / 3600000);
      const kwh = ((r.wattage ?? 0) * hours) / 1000;
      const key = dayKey(started);

      let b = buckets.get(key);
      if (!b) {
        b = { sessions: 0, kwh: 0, rooms: new Set() };
        buckets.set(key, b);
      }
      b.sessions += 1;
      b.kwh += kwh;
      if (r.roomId != null) b.rooms.add(r.roomId);

      const t = started >= windowStart ? totals.current : totals.previous;
      t.sessions += 1;
      t.kwh += kwh;
      t.hours += hours;
      if (r.roomId != null) t.rooms.add(r.roomId);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(windowStart);
      cur.setDate(cur.getDate() + i);
      const prev = new Date(cur);
      prev.setDate(prev.getDate() - 7);
      const cb = buckets.get(dayKey(cur));
      const pb = buckets.get(dayKey(prev));
      days.push({
        date: dayKey(cur),
        label: cur.toLocaleDateString("en-US", { weekday: "short" }),
        roomsUsed: cb?.rooms.size ?? 0,
        sessions: cb?.sessions ?? 0,
        kwh: round(cb?.kwh ?? 0),
        prevDate: dayKey(prev),
        prevRoomsUsed: pb?.rooms.size ?? 0,
        prevSessions: pb?.sessions ?? 0,
        prevKwh: round(pb?.kwh ?? 0),
      });
    }

    res.json({
      propertyId,
      days,
      current: {
        roomsUsed: totals.current.rooms.size,
        sessions: totals.current.sessions,
        kwh: round(totals.current.kwh),
        hours: round(totals.current.hours),
      },
      previous: {
        roomsUsed: totals.previous.rooms.size,
        sessions: totals.previous.sessions,
        kwh: round(totals.previous.kwh),
        hours: round(totals.previous.hours),
      },
    });
  },
);

export default router;
