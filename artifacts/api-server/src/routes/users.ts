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

router.get("/", requirePermission("users.view"), async (req, res) => {
  const user = req.currentUser!;
  // Non-super-admins see only users allocated to their properties.
  // Super admins see everyone.
  let rows;
  if (!user.isSuperAdmin) {
    // Non-super-admins see only users who share at least one property with them.
    // If the caller has no property assignments at all, they see nobody (not a global fallback).
    if (user.propertyIds.length === 0) {
      res.json([]);
      return;
    }
    const sharedUserRows = await db
      .selectDistinct({ userId: userPropertiesTable.userId })
      .from(userPropertiesTable)
      .where(inArray(userPropertiesTable.propertyId, user.propertyIds));
    const sharedIds = sharedUserRows.map(r => r.userId);
    if (sharedIds.length === 0) { res.json([]); return; }
    rows = await db
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
      .where(inArray(appUsersTable.id, sharedIds))
      .orderBy(appUsersTable.id);
  } else {
    rows = await db
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
  }
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

/**
 * Returns true when the caller (a non-super-admin) may act on `targetUserId`.
 * A target user is in scope if they share at least one property with the caller.
 * Super-admins always pass — call site must short-circuit before calling this.
 */
async function callerCanTargetUser(
  callerPropertyIds: number[],
  targetUserId: number,
): Promise<boolean> {
  if (callerPropertyIds.length === 0) return false;
  const targetProps = await db
    .select({ propertyId: userPropertiesTable.propertyId })
    .from(userPropertiesTable)
    .where(eq(userPropertiesTable.userId, targetUserId));
  const targetPropertyIds = targetProps.map((r) => r.propertyId);
  return callerPropertyIds.some((pid) => targetPropertyIds.includes(pid));
}

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
  const caller = req.currentUser!;
  const propIds = await validPropertyIds(body.propertyIds ?? []);
  // Non-super-admins may only assign properties they themselves belong to.
  if (!caller.isSuperAdmin) {
    const forbidden = propIds.filter((pid) => !caller.propertyIds.includes(pid));
    if (forbidden.length > 0) {
      res.status(403).json({ error: "You can only assign users to properties you have access to." });
      return;
    }
  }
  // Validate roleId: the role must belong to one of the user's assigned properties.
  // This enforces role-property consistency regardless of who the caller is.
  if (body.roleId !== undefined && body.roleId !== null) {
    const roleRow = await db
      .select({ propertyId: rolesTable.propertyId })
      .from(rolesTable)
      .where(eq(rolesTable.id, body.roleId))
      .limit(1);
    if (!roleRow[0]) {
      res.status(400).json({ error: "Role not found." });
      return;
    }
    const rolePropertyId = roleRow[0].propertyId;
    // Role must belong to one of the user's property assignments.
    if (rolePropertyId === null || !propIds.includes(rolePropertyId)) {
      res.status(400).json({ error: "The selected role does not belong to one of the user's assigned properties." });
      return;
    }
  }
  const newId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(appUsersTable)
      .values({
        email: body.email,
        name: body.name,
        roleId: body.roleId ?? null,
        isSuperAdmin: caller.isSuperAdmin
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
  const caller = req.currentUser!;
  // Non-super-admins can only mutate users within their own property scope.
  if (!caller.isSuperAdmin && !(await callerCanTargetUser(caller.propertyIds, id))) {
    res.status(403).json({ error: "You do not have access to this user." });
    return;
  }
  // Non-super-admins may not edit super-admin accounts at all (not just the isSuperAdmin field).
  if (!caller.isSuperAdmin && existing[0]!.isSuperAdmin) {
    res.status(403).json({ error: "Only super admins can modify other super admin accounts." });
    return;
  }
  // Only super admins may change super-admin status (prevents self/other escalation).
  if (body.isSuperAdmin !== undefined && !caller.isSuperAdmin) {
    res
      .status(403)
      .json({ error: "Only super admins can change super admin access." });
    return;
  }
  const propIds =
    body.propertyIds !== undefined
      ? await validPropertyIds(body.propertyIds)
      : undefined;
  // Non-super-admins may only assign properties they themselves belong to.
  if (!caller.isSuperAdmin && propIds !== undefined) {
    const forbidden = propIds.filter((pid) => !caller.propertyIds.includes(pid));
    if (forbidden.length > 0) {
      res.status(403).json({ error: "You can only assign users to properties you have access to." });
      return;
    }
  }
  // Validate roleId: the role must belong to one of the user's final property assignments.
  if (body.roleId !== undefined && body.roleId !== null) {
    // "Final" property set = new propIds if being changed, else the user's existing properties.
    const finalPropIds: number[] = propIds !== undefined
      ? propIds
      : (await db
          .select({ propertyId: userPropertiesTable.propertyId })
          .from(userPropertiesTable)
          .where(eq(userPropertiesTable.userId, id))
        ).map((r) => r.propertyId);
    const roleRow = await db
      .select({ propertyId: rolesTable.propertyId })
      .from(rolesTable)
      .where(eq(rolesTable.id, body.roleId))
      .limit(1);
    if (!roleRow[0]) {
      res.status(400).json({ error: "Role not found." });
      return;
    }
    const rolePropertyId = roleRow[0].propertyId;
    if (rolePropertyId === null || !finalPropIds.includes(rolePropertyId)) {
      res.status(400).json({ error: "The selected role does not belong to one of the user's assigned properties." });
      return;
    }
  }
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
  const delCaller = req.currentUser!;
  if (delCaller.id === id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }
  const existing = await db
    .select({ id: appUsersTable.id, isSuperAdmin: appUsersTable.isSuperAdmin })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Non-super-admins can only delete users within their own property scope.
  if (!delCaller.isSuperAdmin && !(await callerCanTargetUser(delCaller.propertyIds, id))) {
    res.status(403).json({ error: "You do not have access to this user." });
    return;
  }
  // Non-super-admins may not delete super-admin accounts.
  if (!delCaller.isSuperAdmin && existing[0]!.isSuperAdmin) {
    res.status(403).json({ error: "Only super admins can delete super admin accounts." });
    return;
  }
  await db.delete(appUsersTable).where(eq(appUsersTable.id, id));
  res.status(204).end();
});

export default router;
