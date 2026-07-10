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

// How property codes are assigned: "manual" (admin types it) or "auto"
// (generated as `<prefix>-NNN`). Configured on the Software Setup page.
export async function getPropertyCodeConfig(): Promise<{
  mode: "manual" | "auto";
  prefix: string;
}> {
  const rows = await db
    .select({
      mode: systemSettingsTable.propertyCodeMode,
      prefix: systemSettingsTable.propertyCodePrefix,
    })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  const mode = rows[0]?.mode === "auto" ? "auto" : "manual";
  const prefix = rows[0]?.prefix?.trim() || "PROP";
  return { mode, prefix };
}
