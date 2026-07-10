import { sql } from "drizzle-orm";
import { db, rolesTable } from "@workspace/db";
import { SYSTEM_ROLES } from "./permissions";
import { logger } from "./logger";

// Idempotently ensure the built-in system roles exist. Runs on server startup.
export async function seedSystemRoles(): Promise<void> {
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rolesTable);
  if ((existing[0]?.count ?? 0) > 0) return;

  await db.insert(rolesTable).values(
    SYSTEM_ROLES.map((r) => ({
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      isSystem: true,
    })),
  );
  logger.info("Seeded system roles");
}
