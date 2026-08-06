import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  appUsersTable,
  rolesTable,
  userPropertiesTable,
  type AppUserRow,
} from "@workspace/db";
import { ALL_PERMISSION_KEYS } from "./permissions";

export interface CurrentUser {
  id: number;
  clerkUserId: string | null;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  active: boolean;
  roleId: number | null;
  roleName: string | null;
  permissions: string[];
  propertyIds: number[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
    }
  }
}

async function loadUserContext(user: AppUserRow): Promise<CurrentUser> {
  const [roleRow, propRows] = await Promise.all([
    user.roleId
      ? db
          .select()
          .from(rolesTable)
          .where(eq(rolesTable.id, user.roleId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ propertyId: userPropertiesTable.propertyId })
      .from(userPropertiesTable)
      .where(eq(userPropertiesTable.userId, user.id)),
  ]);

  const role = roleRow[0];

  // Allow a comma-separated env var to grant superadmin to specific emails
  // without a DB write — useful for the initial production bootstrap where
  // the DB record was created before superadmin could be set.
  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const forcedSuperAdmin =
    !!user.email && superAdminEmails.includes(user.email.toLowerCase());
  const isSuperAdmin = user.isSuperAdmin || forcedSuperAdmin;

  const permissions = isSuperAdmin
    ? ALL_PERMISSION_KEYS
    : (role?.permissions ?? []);

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    isSuperAdmin,
    active: user.active,
    roleId: user.roleId,
    roleName: role?.name ?? null,
    permissions,
    propertyIds: propRows.map((p) => p.propertyId),
  };
}

// Just-in-time provisioning: map a Clerk identity to an app_users row. The very
// first user to sign in bootstraps as a super admin. Users pre-created by an
// admin (with a matching email but no clerkUserId yet) get linked on first login.
async function getOrCreateAppUser(clerkUserId: string): Promise<AppUserRow> {
  const existing = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (existing[0]) return existing[0];

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email ||
    "User";

  // Link a pre-provisioned user invited by email.
  if (email) {
    const byEmail = await db
      .select()
      .from(appUsersTable)
      .where(
        and(
          sql`lower(${appUsersTable.email}) = lower(${email})`,
          sql`${appUsersTable.clerkUserId} is null`,
        ),
      )
      .limit(1);
    if (byEmail[0]) {
      const updated = await db
        .update(appUsersTable)
        .set({ clerkUserId, name: byEmail[0].name || name })
        .where(eq(appUsersTable.id, byEmail[0].id))
        .returning();
      return updated[0]!;
    }
  }

  // Bootstrap the first user as super admin. An advisory lock serializes
  // concurrent first-logins so the count->insert can't produce two super admins.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(778341)`);
    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(appUsersTable);
    const isFirstUser = (countRows[0]?.count ?? 0) === 0;

    const inserted = await tx
      .insert(appUsersTable)
      .values({
        clerkUserId,
        email,
        name,
        isSuperAdmin: isFirstUser,
        active: true,
      })
      .returning();
    return inserted[0]!;
  });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const appUser = await getOrCreateAppUser(clerkUserId);
    if (!appUser.active) {
      res.status(403).json({ error: "Your account has been deactivated." });
      return;
    }
    req.currentUser = await loadUserContext(appUser);
    next();
  } catch (err) {
    req.log?.error({ err }, "auth failed");
    res.status(500).json({ error: "Authentication error" });
  }
}

export function hasPermission(user: CurrentUser, key: string): boolean {
  return user.isSuperAdmin || user.permissions.includes(key);
}

export function requirePermission(key: string | string[]) {
  const keys = Array.isArray(key) ? key : [key];
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!keys.some((k) => hasPermission(user, k))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

// Super admins can reach every property; everyone else is limited to their
// allocated properties.
export function canAccessProperty(user: CurrentUser, propertyId: number): boolean {
  return user.isSuperAdmin || user.propertyIds.includes(propertyId);
}

export function accessiblePropertyIds(user: CurrentUser): number[] | "all" {
  return user.isSuperAdmin ? "all" : user.propertyIds;
}
