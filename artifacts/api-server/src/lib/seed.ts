import { sql } from "drizzle-orm";
import { db, rolesTable } from "@workspace/db";
import { logger } from "./logger";

// System roles are now seeded per-property when a property is created.
// At startup we only *sync* newly introduced permission keys into the
// existing seeded system roles, so deployments don't require manual SQL.
export async function seedSystemRoles(): Promise<void> {
  // Schema sync: columns added after the last manual prod migration.
  // Idempotent — safe to run on every startup.
  await db.execute(sql`
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false
  `);

  // controls.operate (relay ON/OFF) was split out of controls.manage.
  // Grant it to the default staff roles that should be able to flip relays.
  const result = await db.execute(sql`
    UPDATE roles
    SET permissions = array_append(permissions, 'controls.operate')
    WHERE is_system = true
      AND name IN ('Manager', 'Receptionist', 'Housekeeping')
      AND NOT ('controls.operate' = ANY(permissions))
  `);
  const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (updated > 0) {
    logger.info({ updated }, "seedSystemRoles: granted controls.operate to system roles");
  }
  void rolesTable; // keep import used
}
