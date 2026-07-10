import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, rolesTable, type RoleRow } from "@workspace/db";
import { CreateRoleBody, UpdateRoleBody } from "@workspace/api-zod";
import { requirePermission } from "../lib/auth";
import { parseId, validateBody } from "../lib/http";
import { ALL_PERMISSION_KEYS } from "../lib/permissions";

const router: IRouter = Router();

const serialize = (r: RoleRow) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  permissions: r.permissions,
  isSystem: r.isSystem,
});

// Keep only permission keys the app actually recognizes.
const sanitize = (keys: string[]): string[] =>
  keys.filter((k) => ALL_PERMISSION_KEYS.includes(k));

router.get("/", requirePermission("roles.view"), async (_req, res) => {
  const rows = await db.select().from(rolesTable).orderBy(rolesTable.id);
  res.json(rows.map(serialize));
});

router.post("/", requirePermission("roles.manage"), async (req, res) => {
  const body = validateBody(CreateRoleBody, req, res);
  if (!body) return;
  const inserted = await db
    .insert(rolesTable)
    .values({
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
    .where(eq(rolesTable.id, id))
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
  if (existing[0].isSystem) {
    res.status(403).json({ error: "System roles cannot be deleted." });
    return;
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  res.status(204).end();
});

export default router;
