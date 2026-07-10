import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  roomsTable,
  blocksTable,
  floorsTable,
  roomTypesTable,
} from "@workspace/db";
import { CreateRoomBody, UpdateRoomBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";
import { refBelongsToProperty } from "../lib/integrity";
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
