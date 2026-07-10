import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  appUsersTable,
  rolesTable,
  userPropertiesTable,
  propertiesTable,
} from "@workspace/db";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";
import { requirePermission } from "../lib/auth";
import { parseId, validateBody } from "../lib/http";

const router: IRouter = Router();

async function propertyIdsFor(userIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select()
    .from(userPropertiesTable)
    .where(inArray(userPropertiesTable.userId, userIds));
  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    list.push(r.propertyId);
    map.set(r.userId, list);
  }
  return map;
}

// Only keep property ids that actually exist (avoids FK violations).
async function validPropertyIds(ids: number[]): Promise<number[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(inArray(propertiesTable.id, unique));
  return rows.map((r) => r.id);
}

router.get("/", requirePermission("users.view"), async (_req, res) => {
  const rows = await db
    .select({
      id: appUsersTable.id,
      email: appUsersTable.email,
      name: appUsersTable.name,
      isSuperAdmin: appUsersTable.isSuperAdmin,
      active: appUsersTable.active,
      roleId: appUsersTable.roleId,
      roleName: rolesTable.name,
      createdAt: appUsersTable.createdAt,
    })
    .from(appUsersTable)
    .leftJoin(rolesTable, eq(appUsersTable.roleId, rolesTable.id))
    .orderBy(appUsersTable.id);
  const propMap = await propertyIdsFor(rows.map((r) => r.id));
  res.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      isSuperAdmin: r.isSuperAdmin,
      active: r.active,
      roleId: r.roleId,
      roleName: r.roleName,
      propertyIds: propMap.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

async function serializeOne(id: number) {
  const rows = await db
    .select({
      id: appUsersTable.id,
      email: appUsersTable.email,
      name: appUsersTable.name,
      isSuperAdmin: appUsersTable.isSuperAdmin,
      active: appUsersTable.active,
      roleId: appUsersTable.roleId,
      roleName: rolesTable.name,
      createdAt: appUsersTable.createdAt,
    })
    .from(appUsersTable)
    .leftJoin(rolesTable, eq(appUsersTable.roleId, rolesTable.id))
    .where(eq(appUsersTable.id, id))
    .limit(1);
  const r = rows[0]!;
  const propMap = await propertyIdsFor([id]);
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    isSuperAdmin: r.isSuperAdmin,
    active: r.active,
    roleId: r.roleId,
    roleName: r.roleName,
    propertyIds: propMap.get(id) ?? [],
    createdAt: r.createdAt.toISOString(),
  };
}

router.post("/", requirePermission("users.manage"), async (req, res) => {
  const body = validateBody(CreateUserBody, req, res);
  if (!body) return;
  const existing = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(eq(appUsersTable.email, body.email))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "A user with this email already exists." });
    return;
  }
  // Only super admins may grant super-admin access; prevents privilege escalation.
  if (body.isSuperAdmin && !req.currentUser!.isSuperAdmin) {
    res
      .status(403)
      .json({ error: "Only super admins can grant super admin access." });
    return;
  }
  const propIds = await validPropertyIds(body.propertyIds ?? []);
  const newId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(appUsersTable)
      .values({
        email: body.email,
        name: body.name,
        roleId: body.roleId ?? null,
        isSuperAdmin: req.currentUser!.isSuperAdmin
          ? (body.isSuperAdmin ?? false)
          : false,
        active: body.active ?? true,
      })
      .returning({ id: appUsersTable.id });
    const uid = inserted[0]!.id;
    if (propIds.length) {
      await tx
        .insert(userPropertiesTable)
        .values(propIds.map((pid) => ({ userId: uid, propertyId: pid })));
    }
    return uid;
  });
  res.status(201).json(await serializeOne(newId));
});

router.patch("/:id", requirePermission("users.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateUserBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Only super admins may change super-admin status (prevents self/other escalation).
  if (body.isSuperAdmin !== undefined && !req.currentUser!.isSuperAdmin) {
    res
      .status(403)
      .json({ error: "Only super admins can change super admin access." });
    return;
  }
  const propIds =
    body.propertyIds !== undefined
      ? await validPropertyIds(body.propertyIds)
      : undefined;
  await db.transaction(async (tx) => {
    await tx
      .update(appUsersTable)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.roleId !== undefined ? { roleId: body.roleId } : {}),
        ...(body.isSuperAdmin !== undefined
          ? { isSuperAdmin: body.isSuperAdmin }
          : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      })
      .where(eq(appUsersTable.id, id));
    if (propIds !== undefined) {
      await tx
        .delete(userPropertiesTable)
        .where(eq(userPropertiesTable.userId, id));
      if (propIds.length) {
        await tx
          .insert(userPropertiesTable)
          .values(propIds.map((pid) => ({ userId: id, propertyId: pid })));
      }
    }
  });
  res.json(await serializeOne(id));
});

router.delete("/:id", requirePermission("users.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (req.currentUser!.id === id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }
  const existing = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(appUsersTable).where(eq(appUsersTable.id, id));
  res.status(204).end();
});

export default router;
