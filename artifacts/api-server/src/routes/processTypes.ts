import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, processTypesTable, type ProcessTypeRow } from "@workspace/db";
import { CreateProcessTypeBody, UpdateProcessTypeBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";

const router: IRouter = Router();

const serialize = (r: ProcessTypeRow) => ({
  id: r.id,
  propertyId: r.propertyId,
  name: r.name,
  description: r.description,
  cutoffMinutes: r.cutoffMinutes,
  isAuto: r.isAuto,
  active: r.active,
});

router.get("/", requirePermission("processTypes.view"), async (req, res) => {
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
    .from(processTypesTable)
    .where(eq(processTypesTable.propertyId, propertyId));
  res.json(rows.map(serialize));
});

router.post("/", requirePermission("processTypes.manage"), async (req, res) => {
  const body = validateBody(CreateProcessTypeBody, req, res);
  if (!body) return;
  if (!canAccessProperty(req.currentUser!, body.propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const inserted = await db
    .insert(processTypesTable)
    .values({
      propertyId: body.propertyId,
      name: body.name,
      description: body.description,
      cutoffMinutes: body.cutoffMinutes ?? 0,
      isAuto: body.isAuto ?? false,
      active: body.active ?? true,
    })
    .returning();
  res.status(201).json(serialize(inserted[0]!));
});

router.patch(
  "/:id",
  requirePermission("processTypes.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = validateBody(UpdateProcessTypeBody, req, res);
    if (!body) return;
    const existing = await db
      .select()
      .from(processTypesTable)
      .where(eq(processTypesTable.id, id))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const updated = await db
      .update(processTypesTable)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.cutoffMinutes !== undefined
          ? { cutoffMinutes: body.cutoffMinutes }
          : {}),
        ...(body.isAuto !== undefined ? { isAuto: body.isAuto } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      })
      .where(eq(processTypesTable.id, id))
      .returning();
    res.json(serialize(updated[0]!));
  },
);

router.delete(
  "/:id",
  requirePermission("processTypes.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const existing = await db
      .select()
      .from(processTypesTable)
      .where(eq(processTypesTable.id, id))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(processTypesTable).where(eq(processTypesTable.id, id));
    res.status(204).end();
  },
);

export default router;
