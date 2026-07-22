import { Router, type IRouter } from "express";
import { eq, asc, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  roomsTable,
  blocksTable,
  floorsTable,
  roomTypesTable,
  controlsTable,
  controlTypesTable,
  devicesTable,
} from "@workspace/db";
import { CreateRoomBody, UpdateRoomBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";
import { refBelongsToProperty } from "../lib/integrity";
import { getOfflineThresholdMinutes } from "../lib/settings";
import { isDeviceOnline } from "../lib/serialize";
import type { Response } from "express";

const router: IRouter = Router();

// Ensures each provided foreign key belongs to the same property. Returns true
// when a validation error was sent (caller should stop).
async function rejectForeignRefs(
  res: Response,
  propertyId: number,
  refs: { blockId?: number | null; floorId?: number | null; roomTypeId?: number | null },
): Promise<boolean> {
  if (
    refs.blockId != null &&
    !(await refBelongsToProperty(blocksTable, refs.blockId, propertyId))
  ) {
    res.status(400).json({ error: "blockId does not belong to this property" });
    return true;
  }
  if (
    refs.floorId != null &&
    !(await refBelongsToProperty(floorsTable, refs.floorId, propertyId))
  ) {
    res.status(400).json({ error: "floorId does not belong to this property" });
    return true;
  }
  if (
    refs.roomTypeId != null &&
    !(await refBelongsToProperty(roomTypesTable, refs.roomTypeId, propertyId))
  ) {
    res
      .status(400)
      .json({ error: "roomTypeId does not belong to this property" });
    return true;
  }
  return false;
}

const selection = {
  id: roomsTable.id,
  propertyId: roomsTable.propertyId,
  roomNo: roomsTable.roomNo,
  blockId: roomsTable.blockId,
  floorId: roomsTable.floorId,
  roomTypeId: roomsTable.roomTypeId,
  active: roomsTable.active,
  blockName: blocksTable.name,
  floorName: floorsTable.name,
  roomTypeName: roomTypesTable.name,
};

function withJoins() {
  return db
    .select(selection)
    .from(roomsTable)
    .leftJoin(blocksTable, eq(roomsTable.blockId, blocksTable.id))
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(roomTypesTable, eq(roomsTable.roomTypeId, roomTypesTable.id));
}

router.get("/", requirePermission("rooms.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await withJoins().where(eq(roomsTable.propertyId, propertyId));
  res.json(rows);
});

// Room chart: every room (with block/floor/type) plus its mapped controls and
// each control's live on/off state and whether the driving device is online.
// Powers the visual room-status board grouped by block/floor/room number.
router.get("/chart", requirePermission("rooms.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [roomRows, controlRows, threshold] = await Promise.all([
    withJoins().where(eq(roomsTable.propertyId, propertyId)),
    db
      .select({
        id: controlsTable.id,
        roomId: controlsTable.roomId,
        controlTypeId: controlsTable.controlTypeId,
        controlTypeName: controlTypesTable.name,
        label: controlsTable.label,
        state: controlsTable.state,
        deviceId: controlsTable.deviceId,
        deviceCode: devicesTable.code,
        lastSeenAt: devicesTable.lastSeenAt,
      })
      .from(controlsTable)
      .leftJoin(
        controlTypesTable,
        eq(controlsTable.controlTypeId, controlTypesTable.id),
      )
      .leftJoin(devicesTable, eq(controlsTable.deviceId, devicesTable.id))
      .where(eq(controlsTable.propertyId, propertyId))
      .orderBy(asc(controlsTable.slate), asc(controlsTable.channel)),
    getOfflineThresholdMinutes(),
  ]);

  const byRoom = new Map<number, unknown[]>();
  for (const c of controlRows) {
    if (c.roomId == null) continue;
    const list = byRoom.get(c.roomId) ?? [];
    list.push({
      id: c.id,
      controlTypeId: c.controlTypeId,
      controlTypeName: c.controlTypeName,
      label: c.label,
      state: c.state,
      on: c.state !== 0,
      deviceId: c.deviceId,
      deviceCode: c.deviceCode,
      deviceOnline: isDeviceOnline(c.lastSeenAt, threshold),
    });
    byRoom.set(c.roomId, list);
  }

  res.json(roomRows.map((r) => ({ ...r, controls: byRoom.get(r.id) ?? [] })));
});

router.post("/bulk", requirePermission("rooms.manage"), async (req, res) => {
  const BulkBody = z.object({
    propertyId: z.number().int().positive(),
    rooms: z
      .array(
        z.object({
          roomNo: z.string().min(1),
          blockId: z.number().int().nullable().optional(),
          floorId: z.number().int().nullable().optional(),
          roomTypeId: z.number().int().nullable().optional(),
        }),
      )
      .min(1)
      .max(500),
  });
  const parsed = BulkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { propertyId, rooms } = parsed.data;
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Validate all FK references belong to this property
  const blockIds = [...new Set(rooms.map((r) => r.blockId).filter((id): id is number => id != null))];
  const floorIds = [...new Set(rooms.map((r) => r.floorId).filter((id): id is number => id != null))];
  const roomTypeIds = [...new Set(rooms.map((r) => r.roomTypeId).filter((id): id is number => id != null))];

  if (blockIds.length > 0) {
    const validBlocks = await db.select({ id: blocksTable.id }).from(blocksTable)
      .where(and(eq(blocksTable.propertyId, propertyId), inArray(blocksTable.id, blockIds)));
    const validSet = new Set(validBlocks.map((b) => b.id));
    if (blockIds.some((id) => !validSet.has(id))) {
      res.status(400).json({ error: "One or more blockIds do not belong to this property" });
      return;
    }
  }
  if (floorIds.length > 0) {
    const validFloors = await db.select({ id: floorsTable.id }).from(floorsTable)
      .where(and(eq(floorsTable.propertyId, propertyId), inArray(floorsTable.id, floorIds)));
    const validSet = new Set(validFloors.map((f) => f.id));
    if (floorIds.some((id) => !validSet.has(id))) {
      res.status(400).json({ error: "One or more floorIds do not belong to this property" });
      return;
    }
  }
  if (roomTypeIds.length > 0) {
    const validTypes = await db.select({ id: roomTypesTable.id }).from(roomTypesTable)
      .where(and(eq(roomTypesTable.propertyId, propertyId), inArray(roomTypesTable.id, roomTypeIds)));
    const validSet = new Set(validTypes.map((t) => t.id));
    if (roomTypeIds.some((id) => !validSet.has(id))) {
      res.status(400).json({ error: "One or more roomTypeIds do not belong to this property" });
      return;
    }
  }

  // Find already-existing roomNos for this property so we can skip them
  const existingRows = await db.select({ roomNo: roomsTable.roomNo }).from(roomsTable)
    .where(eq(roomsTable.propertyId, propertyId));
  const existingNos = new Set(existingRows.map((r) => r.roomNo));

  const toInsert = rooms.filter((r) => !existingNos.has(r.roomNo));
  if (toInsert.length > 0) {
    await db.insert(roomsTable).values(
      toInsert.map((r) => ({
        propertyId,
        roomNo: r.roomNo,
        blockId: r.blockId ?? null,
        floorId: r.floorId ?? null,
        roomTypeId: r.roomTypeId ?? null,
        active: true,
      })),
    );
  }

  res.json({ created: toInsert.length, skipped: rooms.length - toInsert.length });
});

router.post("/", requirePermission("rooms.manage"), async (req, res) => {
  const body = validateBody(CreateRoomBody, req, res);
  if (!body) return;
  if (!canAccessProperty(req.currentUser!, body.propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (await rejectForeignRefs(res, body.propertyId, body)) return;
  const inserted = await db
    .insert(roomsTable)
    .values({
      propertyId: body.propertyId,
      roomNo: body.roomNo,
      blockId: body.blockId ?? null,
      floorId: body.floorId ?? null,
      roomTypeId: body.roomTypeId ?? null,
      active: body.active ?? true,
    })
    .returning({ id: roomsTable.id });
  const rows = await withJoins().where(eq(roomsTable.id, inserted[0]!.id));
  res.status(201).json(rows[0]);
});

router.patch("/:id", requirePermission("rooms.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateRoomBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (await rejectForeignRefs(res, existing[0].propertyId, body)) return;
  await db
    .update(roomsTable)
    .set({
      ...(body.roomNo !== undefined ? { roomNo: body.roomNo } : {}),
      ...(body.blockId !== undefined ? { blockId: body.blockId } : {}),
      ...(body.floorId !== undefined ? { floorId: body.floorId } : {}),
      ...(body.roomTypeId !== undefined ? { roomTypeId: body.roomTypeId } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(roomsTable.id, id));
  const rows = await withJoins().where(eq(roomsTable.id, id));
  res.json(rows[0]);
});

router.delete("/:id", requirePermission("rooms.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(roomsTable).where(eq(roomsTable.id, id));
  res.status(204).end();
});

export default router;
