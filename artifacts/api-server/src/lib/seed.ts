import { sql } from "drizzle-orm";
import { db, rolesTable } from "@workspace/db";
import { logger } from "./logger";

// System roles are now seeded per-property when a property is created.
// This function is kept as a no-op for backward compatibility with startup code.
export async function seedSystemRoles(): Promise<void> {
  // Per-property default roles are seeded by the property creation route.
  // Global system roles (property_id IS NULL) are intentionally left alone.
  logger.info("seedSystemRoles: no-op — roles are seeded per property now");
}
