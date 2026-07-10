import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, controlTypesTable, type ControlTypeRow } from "@workspace/db";
import { CreateControlTypeBody, UpdateControlTypeBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";

const router: IRouter = Router();

const serialize = (r: ControlTypeRow) => ({
  id: r.id,
  propertyId: r.propertyId,
  name: r.name,
  powerRatingWatts: r.powerRatingWatts,
  active: r.active,
});

router.get("/", requirePermission("controlTypes.view"), async (req, res) => {
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
    .from(controlTypesTable)
    .where(eq(controlTypesTable.propertyId, propertyId));
  res.json(rows.map(serialize));
});

router.post("/", requirePermission("controlTypes.manage"), async (req, res) => {
  const body = validateBody(CreateControlTypeBody, req, res);
  if (!body) return;
  if (!canAccessProperty(req.currentUser!, body.propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const inserted = await db
    .insert(controlTypesTable)
    .values({
      propertyId: body.propertyId,
      name: body.name,
      powerRatingWatts: body.powerRatingWatts ?? 0,
      active: body.active ?? true,
    })
    .returning();
  res.status(201).json(serialize(inserted[0]!));
});

router.patch(
  "/:id",
  requirePermission("controlTypes.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = validateBody(UpdateControlTypeBody, req, res);
    if (!body) return;
    const existing = await db
      .select()
      .from(controlTypesTable)
      .where(eq(controlTypesTable.id, id))
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
      .update(controlTypesTable)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.powerRatingWatts !== undefined
          ? { powerRatingWatts: body.powerRatingWatts }
          : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      })
      .where(eq(controlTypesTable.id, id))
      .returning();
    res.json(serialize(updated[0]!));
  },
);

router.delete(
  "/:id",
  requirePermission("controlTypes.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const existing = await db
      .select()
      .from(controlTypesTable)
      .where(eq(controlTypesTable.id, id))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(controlTypesTable).where(eq(controlTypesTable.id, id));
    res.status(204).end();
  },
);

export default router;
