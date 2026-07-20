import { Router, type IRouter } from "express";
import { eq, asc, inArray } from "drizzle-orm";
import {
  db,
  controlsTable,
  devicesTable,
  roomsTable,
  controlTypesTable,
} from "@workspace/db";
import { UpdateControlBody, BulkUpdateControlsBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, validateBody } from "../lib/http";
import { refBelongsToProperty } from "../lib/integrity";

const router: IRouter = Router();

const selection = {
  id: controlsTable.id,
  deviceId: controlsTable.deviceId,
  propertyId: controlsTable.propertyId,
  slate: controlsTable.slate,
  channel: controlsTable.channel,
  label: controlsTable.label,
  roomId: controlsTable.roomId,
  roomNo: roomsTable.roomNo,
  controlTypeId: controlsTable.controlTypeId,
  controlTypeName: controlTypesTable.name,
  state: controlsTable.state,
  wattage: controlsTable.wattage,
};

function withJoins() {
  return db
    .select(selection)
    .from(controlsTable)
    .leftJoin(roomsTable, eq(controlsTable.roomId, roomsTable.id))
    .leftJoin(
      controlTypesTable,
      eq(controlsTable.controlTypeId, controlTypesTable.id),
    );
}

router.get("/", requirePermission("devices.view"), async (req, res) => {
  const raw = req.query["deviceId"];
  const deviceId = typeof raw === "string" ? parseId(raw) : null;
  if (deviceId === null) {
    res.status(400).json({ error: "deviceId query param is required" });
    return;
  }
  const device = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId))
    .limit(1);
  if (!device[0]) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, device[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await withJoins()
    .where(eq(controlsTable.deviceId, deviceId))
    .orderBy(asc(controlsTable.slate), asc(controlsTable.channel));
  res.json(rows);
});

// Bulk-assign many channels to rooms / load types in one atomic batch. Declared
// before "/:id" so the literal "bulk" path is not parsed as an id.
router.patch("/bulk", requirePermission("controls.manage"), async (req, res) => {
  const body = validateBody(BulkUpdateControlsBody, req, res);
  if (!body) return;
  if (body.items.length === 0) {
    res.json([]);
    return;
  }

  const ids = [...new Set(body.items.map((i) => i.id))];
  const existing = await db
    .select()
    .from(controlsTable)
    .where(inArray(controlsTable.id, ids));
  if (existing.length !== ids.length) {
    res.status(404).json({ error: "One or more controls not found" });
    return;
  }

  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of existing) {
    if (!canAccessProperty(req.currentUser!, c.propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Validate every referenced room / control type belongs to the same property
  // as its control (tenant isolation — see integrity rules).
  for (const item of body.items) {
    const pid = byId.get(item.id)!.propertyId;
    if (
      item.roomId != null &&
      !(await refBelongsToProperty(roomsTable, item.roomId, pid))
    ) {
      res
        .status(400)
        .json({ error: `roomId ${item.roomId} does not belong to this property` });
      return;
    }
    if (
      item.controlTypeId != null &&
      !(await refBelongsToProperty(controlTypesTable, item.controlTypeId, pid))
    ) {
      res.status(400).json({
        error: `controlTypeId ${item.controlTypeId} does not belong to this property`,
      });
      return;
    }
  }

  await db.transaction(async (tx) => {
    for (const item of body.items) {
      await tx
        .update(controlsTable)
        .set({
          ...(item.label !== undefined ? { label: item.label } : {}),
          ...(item.roomId !== undefined ? { roomId: item.roomId } : {}),
          ...(item.controlTypeId !== undefined
            ? { controlTypeId: item.controlTypeId }
            : {}),
          ...(item.wattage !== undefined ? { wattage: item.wattage } : {}),
        })
        .where(eq(controlsTable.id, item.id));
    }
  });

  const rows = await withJoins()
    .where(inArray(controlsTable.id, ids))
    .orderBy(asc(controlsTable.slate), asc(controlsTable.channel));
  res.json(rows);
});

router.patch("/:id", requirePermission("controls.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateControlBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(controlsTable)
    .where(eq(controlsTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const pid = existing[0].propertyId;
  if (
    body.roomId != null &&
    !(await refBelongsToProperty(roomsTable, body.roomId, pid))
  ) {
    res.status(400).json({ error: "roomId does not belong to this property" });
    return;
  }
  if (
    body.controlTypeId != null &&
    !(await refBelongsToProperty(controlTypesTable, body.controlTypeId, pid))
  ) {
    res
      .status(400)
      .json({ error: "controlTypeId does not belong to this property" });
    return;
  }
  await db
    .update(controlsTable)
    .set({
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      ...(body.controlTypeId !== undefined
        ? { controlTypeId: body.controlTypeId }
        : {}),
      ...(body.wattage !== undefined ? { wattage: body.wattage } : {}),
    })
    .where(eq(controlsTable.id, id));
  const rows = await withJoins().where(eq(controlsTable.id, id));
  res.json(rows[0]);
});

export default router;
