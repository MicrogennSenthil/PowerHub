import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { CreatePropertyBody, UpdatePropertyBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, validateBody } from "../lib/http";
import { serializeProperty } from "../lib/serialize";

const router: IRouter = Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser?.isSuperAdmin) {
    res.status(403).json({ error: "Only super admins can perform this action." });
    return;
  }
  next();
}

router.get("/", requirePermission("properties.view"), async (req, res) => {
  const user = req.currentUser!;
  const rows = user.isSuperAdmin
    ? await db.select().from(propertiesTable)
    : user.propertyIds.length
      ? await db
          .select()
          .from(propertiesTable)
          .where(inArray(propertiesTable.id, user.propertyIds))
      : [];
  res.json(rows.map(serializeProperty));
});

router.get("/:id", requirePermission("properties.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeProperty(rows[0]));
});

router.post("/", requireSuperAdmin, async (req, res) => {
  const body = validateBody(CreatePropertyBody, req, res);
  if (!body) return;
  const inserted = await db
    .insert(propertiesTable)
    .values({
      name: body.name,
      code: body.code,
      address: body.address,
      city: body.city,
      pincode: body.pincode,
      email: body.email,
      phone: body.phone,
      currency: body.currency ?? "INR",
      tariffPerKwh: body.tariffPerKwh ?? 0,
      timezone: body.timezone ?? "Asia/Kolkata",
      active: body.active ?? true,
    })
    .returning();
  res.status(201).json(serializeProperty(inserted[0]!));
});

router.patch("/:id", requirePermission("properties.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = validateBody(UpdatePropertyBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = await db
    .update(propertiesTable)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(body.pincode !== undefined ? { pincode: body.pincode } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.tariffPerKwh !== undefined
        ? { tariffPerKwh: body.tariffPerKwh }
        : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(propertiesTable.id, id))
    .returning();
  res.json(serializeProperty(updated[0]!));
});

router.delete("/:id", requireSuperAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(propertiesTable).where(eq(propertiesTable.id, id));
  res.status(204).end();
});

export default router;
