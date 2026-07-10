import { Router, type IRouter } from "express";
import { eq, and, ne, sql } from "drizzle-orm";
import {
  db,
  blocksTable,
  floorsTable,
  roomsTable,
  devicesTable,
  controlsTable,
  processTypesTable,
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

export default router;
