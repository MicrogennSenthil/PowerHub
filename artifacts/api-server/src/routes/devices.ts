import { Router, type IRouter } from "express";
import { eq, sql, inArray, and } from "drizzle-orm";
import {
  db,
  devicesTable,
  controlsTable,
  floorsTable,
  type DeviceRow,
} from "@workspace/db";
import { CreateDeviceBody, UpdateDeviceBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";
import { serializeDevice } from "../lib/serialize";
import { refBelongsToProperty } from "../lib/integrity";
import { getOfflineThresholdMinutes } from "../lib/settings";

const router: IRouter = Router();

const CHANNELS_PER_SLATE = 8;
const SLATES = 2;

async function channelCounts(
  deviceIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (deviceIds.length === 0) return map;
  const rows = await db
    .select({
      deviceId: controlsTable.deviceId,
      count: sql<number>`count(*)::int`,
    })
    .from(controlsTable)
    .where(inArray(controlsTable.deviceId, deviceIds))
    .groupBy(controlsTable.deviceId);
  for (const r of rows) map.set(r.deviceId, r.count);
  return map;
}

async function floorNameMap(
  propertyId: number,
): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: floorsTable.id, name: floorsTable.name })
    .from(floorsTable)
    .where(eq(floorsTable.propertyId, propertyId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function serializeMany(devices: DeviceRow[]) {
  const counts = await channelCounts(devices.map((d) => d.id));
  const propertyIds = [...new Set(devices.map((d) => d.propertyId))];
  const floorMaps = new Map<number, Map<number, string>>();
  const [, threshold] = await Promise.all([
    Promise.all(
      propertyIds.map(async (pid) =>
        floorMaps.set(pid, await floorNameMap(pid)),
      ),
    ),
    getOfflineThresholdMinutes(),
  ]);
  return devices.map((d) =>
    serializeDevice(d, {
      floorName: d.floorId
        ? (floorMaps.get(d.propertyId)?.get(d.floorId) ?? null)
        : null,
      channelCount: counts.get(d.id) ?? 0,
      onlineThresholdMinutes: threshold,
    }),
  );
}

router.get("/", requirePermission("devices.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.propertyId, propertyId));
  res.json(await serializeMany(rows));
});

// Lightweight availability check — called on every keystroke in the UI.
// Codes are globally unique because the relay box poll endpoint has no
// property context — two boxes with the same code would share commands.
// ?code=xxx      required
// ?excludeId=N   optional — skip this device id (used when editing)
router.get("/check-code", requirePermission("devices.view"), async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : null;
  if (!code) {
    res.status(400).json({ error: "code query param is required" });
    return;
  }
  const excludeId = typeof req.query.excludeId === "string"
    ? parseInt(req.query.excludeId, 10)
    : null;

  const rows = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.code, code))
    .limit(1);

  const conflict = rows[0] && (excludeId === null || rows[0].id !== excludeId);
  res.json({ available: !conflict });
});

router.get("/:id", requirePermission("devices.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.id, id))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, rows[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json((await serializeMany(rows))[0]);
});

router.post("/", requirePermission("devices.manage"), async (req, res) => {
  const body = validateBody(CreateDeviceBody, req, res);
  if (!body) return;
  if (!canAccessProperty(req.currentUser!, body.propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (
    body.floorId != null &&
    !(await refBelongsToProperty(floorsTable, body.floorId, body.propertyId))
  ) {
    res.status(400).json({ error: "floorId does not belong to this property" });
    return;
  }
  const device = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(devicesTable)
      .values({
        propertyId: body.propertyId,
        code: body.code,
        ipAddress: body.ipAddress,
        setupIp: body.setupIp,
        description: body.description,
        floorId: body.floorId ?? null,
        active: body.active ?? true,
      })
      .returning();
    const dev = inserted[0]!;
    // Auto-provision the 16 relay channels (2 slates x 8 channels).
    const channels = [];
    for (let slate = 1; slate <= SLATES; slate++) {
      for (let channel = 1; channel <= CHANNELS_PER_SLATE; channel++) {
        channels.push({
          propertyId: dev.propertyId,
          deviceId: dev.id,
          slate,
          channel,
        });
      }
    }
    await tx.insert(controlsTable).values(channels);
    return dev;
  });
  res.status(201).json((await serializeMany([device]))[0]);
});

router.patch("/:id", requirePermission("devices.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateDeviceBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (
    body.floorId != null &&
    !(await refBelongsToProperty(
      floorsTable,
      body.floorId,
      existing[0].propertyId,
    ))
  ) {
    res.status(400).json({ error: "floorId does not belong to this property" });
    return;
  }
  const updated = await db
    .update(devicesTable)
    .set({
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.ipAddress !== undefined ? { ipAddress: body.ipAddress } : {}),
      ...(body.setupIp !== undefined ? { setupIp: body.setupIp } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.floorId !== undefined ? { floorId: body.floorId } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(devicesTable.id, id))
    .returning();
  res.json((await serializeMany([updated[0]!]))[0]);
});

router.delete("/:id", requirePermission("devices.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(devicesTable).where(eq(devicesTable.id, id));
  res.status(204).end();
});

export default router;
