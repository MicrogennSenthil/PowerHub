import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

// Fixed id of the global settings singleton row.
export const SETTINGS_ID = 1;

// The configured device offline threshold (minutes). Falls back to 2 when the
// settings row has not been created yet. Used everywhere device online/offline
// status is derived so all API surfaces stay consistent.
export async function getOfflineThresholdMinutes(): Promise<number> {
  const rows = await db
    .select({ v: systemSettingsTable.offlineThresholdMinutes })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  return rows[0]?.v ?? 2;
}
