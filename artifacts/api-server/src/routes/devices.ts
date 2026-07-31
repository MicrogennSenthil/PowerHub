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
// Uniqueness is per-property: the same code may exist in different properties
// (each maps to a physically distinct relay box on a different site).
// A cross-property collision is allowed but returns a warning so the operator
// knows that the relay poll heuristic will be used if codes clash globally.
// ?code=xxx        required
// ?propertyId=N    required — scope the uniqueness check to this property
// ?excludeId=N     optional — skip this device id (used when editing)
router.get("/check-code", requirePermission("devices.view"), async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : null;
  if (!code) {
    res.status(400).json({ error: "code query param is required" });
    return;
  }
  const propertyId =
    typeof req.query.propertyId === "string"
      ? parseInt(req.query.propertyId, 10)
      : null;
  if (!propertyId || !Number.isInteger(propertyId)) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const excludeId =
    typeof req.query.excludeId === "string"
      ? parseInt(req.query.excludeId, 10)
      : null;

  // 1. Same-property check — blocking: code must be unique within this property.
  const sameProperty = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(and(eq(devicesTable.propertyId, propertyId), eq(devicesTable.code, code)))
    .limit(1);
  const sameConflict =
    sameProperty[0] && (excludeId === null || sameProperty[0].id !== excludeId);

  // 2. Cross-property check — non-blocking warning only.
  // The relay poll endpoint is global, so boxes sharing a code get
  // best-effort command delivery (server prefers the box with a pending cmd).
  // Recommend using a property-prefix code (e.g. KDS001) to avoid ambiguity.
  let crossPropertyWarning = false;
  if (!sameConflict) {
    const others = await db
      .select({ id: devicesTable.id })
      .from(devicesTable)
      .where(
        and(
          eq(devicesTable.code, code),
          // any row NOT belonging to this property
          sql`${devicesTable.propertyId} != ${propertyId}`,
        ),
      )
      .limit(1);
    crossPropertyWarning = !!others[0];
  }

  res.json({
    available: !sameConflict,
    crossPropertyWarning,
  });
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
