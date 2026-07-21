import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, rolesTable, type RoleRow } from "@workspace/db";
import { CreateRoleBody, UpdateRoleBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";
import { ALL_PERMISSION_KEYS } from "../lib/permissions";

const router: IRouter = Router();

const serialize = (r: RoleRow) => ({
  id: r.id,
  propertyId: r.propertyId,
  name: r.name,
  description: r.description,
  permissions: r.permissions,
  isSystem: r.isSystem,
});

// Keep only permission keys the app actually recognizes.
const sanitize = (keys: string[]): string[] =>
  keys.filter((k) => ALL_PERMISSION_KEYS.includes(k));

router.get("/", requirePermission("roles.view"), async (req, res) => {
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
    .from(rolesTable)
    .where(eq(rolesTable.propertyId, propertyId))
    .orderBy(rolesTable.id);
  res.json(rows.map(serialize));
});

router.post("/", requirePermission("roles.manage"), async (req, res) => {
  const body = validateBody(CreateRoleBody, req, res);
  if (!body) return;
  const propertyId: number = (body as any).propertyId;
  if (!propertyId) {
    res.status(400).json({ error: "propertyId is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const inserted = await db
    .insert(rolesTable)
    .values({
      propertyId,
      name: body.name,
      description: body.description,
      permissions: sanitize(body.permissions ?? []),
      isSystem: false,
    })
    .returning();
  res.status(201).json(serialize(inserted[0]!));
});

router.patch("/:id", requirePermission("roles.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateRoleBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Property scope check — only the owning property can mutate its roles.
  if (
    existing[0].propertyId !== null &&
    !canAccessProperty(req.currentUser!, existing[0].propertyId)
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Legacy global roles (propertyId IS NULL) may only be modified by super-admins.
  if (existing[0].propertyId === null && !req.currentUser!.isSuperAdmin) {
    res.status(403).json({ error: "Only super admins can modify global roles." });
    return;
  }
  if (existing[0].isSystem) {
    res.status(403).json({ error: "System roles cannot be modified." });
    return;
  }
  const updated = await db
    .update(rolesTable)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.permissions !== undefined
        ? { permissions: sanitize(body.permissions) }
        : {}),
    })
    .where(
      existing[0].propertyId !== null
        ? and(
            eq(rolesTable.id, id),
            eq(rolesTable.propertyId, existing[0].propertyId),
          )
        : eq(rolesTable.id, id),
    )
    .returning();
  res.json(serialize(updated[0]!));
});

router.delete("/:id", requirePermission("roles.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (
    existing[0].propertyId !== null &&
    !canAccessProperty(req.currentUser!, existing[0].propertyId)
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Legacy global roles (propertyId IS NULL) may only be deleted by super-admins.
  if (existing[0].propertyId === null && !req.currentUser!.isSuperAdmin) {
    res.status(403).json({ error: "Only super admins can delete global roles." });
    return;
  }
  if (existing[0].isSystem) {
    res.status(403).json({ error: "System roles cannot be deleted." });
    return;
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  res.status(204).end();
});

export default router;
