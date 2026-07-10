import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";

// A drizzle table that carries both an `id` and a `propertyId` column. We keep
// this loose on purpose so the helper works across all property-scoped masters.
interface PropertyScopedTable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  propertyId: any;
}

// Guards multi-tenant isolation: confirms a referenced row exists AND belongs to
// the expected property, so callers cannot link records across tenants by
// passing a foreign id from another property.
export async function refBelongsToProperty(
  table: PropertyScopedTable,
  id: number,
  propertyId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: table.id })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(table as any)
    .where(and(eq(table.id, id), eq(table.propertyId, propertyId)))
    .limit(1);
  return rows.length > 0;
}
