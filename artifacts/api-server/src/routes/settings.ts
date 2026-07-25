import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, systemSettingsTable, type SystemSettingsRow } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requirePermission } from "../lib/auth";
import { validateBody } from "../lib/http";
import { SETTINGS_ID } from "../lib/settings";

const router: IRouter = Router();

function serialize(r: SystemSettingsRow) {
  return {
    deviceProtocol: r.deviceProtocol,
    offlineThresholdMinutes: r.offlineThresholdMinutes,
    pollIntervalSeconds: r.pollIntervalSeconds,
    mqttBrokerUrl: r.mqttBrokerUrl,
    mqttPort: r.mqttPort,
    mqttUsername: r.mqttUsername,
    mqttPasswordSet: !!r.mqttPassword,
    mqttBaseTopic: r.mqttBaseTopic,
    mqttUseTls: r.mqttUseTls,
    propertyCodeMode: r.propertyCodeMode,
    propertyCodePrefix: r.propertyCodePrefix,
    smtpHost: r.smtpHost,
    smtpPort: r.smtpPort,
    smtpUser: r.smtpUser,
    smtpPasswordSet: !!r.smtpPassword,
    smtpFrom: r.smtpFrom,
    alertEmailEnabled: r.alertEmailEnabled,
    alertOfflineMinutes: r.alertOfflineMinutes,
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function getOrCreate(): Promise<SystemSettingsRow> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(systemSettingsTable)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  return again[0]!;
}

router.get("/", requirePermission("settings.view"), async (_req, res) => {
  res.json(serialize(await getOrCreate()));
});

router.put("/", requirePermission("settings.manage"), async (req, res) => {
  const body = validateBody(UpdateSettingsBody, req, res);
  if (!body) return;
  await getOrCreate();
  const updated = await db
    .update(systemSettingsTable)
    .set({
      ...(body.deviceProtocol !== undefined
        ? { deviceProtocol: body.deviceProtocol }
        : {}),
      ...(body.offlineThresholdMinutes !== undefined
        ? { offlineThresholdMinutes: body.offlineThresholdMinutes }
        : {}),
      ...(body.pollIntervalSeconds !== undefined
        ? { pollIntervalSeconds: body.pollIntervalSeconds }
        : {}),
      ...(body.mqttBrokerUrl !== undefined
        ? { mqttBrokerUrl: body.mqttBrokerUrl }
        : {}),
      ...(body.mqttPort !== undefined ? { mqttPort: body.mqttPort } : {}),
      ...(body.mqttUsername !== undefined
        ? { mqttUsername: body.mqttUsername }
        : {}),
      // Only overwrite the password when a non-empty value is supplied, so
      // saving the form without re-typing it leaves the stored secret intact.
      ...(body.mqttPassword ? { mqttPassword: body.mqttPassword } : {}),
      ...(body.mqttBaseTopic !== undefined
        ? { mqttBaseTopic: body.mqttBaseTopic }
        : {}),
      ...(body.mqttUseTls !== undefined ? { mqttUseTls: body.mqttUseTls } : {}),
      ...(body.propertyCodeMode !== undefined
        ? { propertyCodeMode: body.propertyCodeMode }
        : {}),
      ...(body.propertyCodePrefix !== undefined && body.propertyCodePrefix
        ? { propertyCodePrefix: body.propertyCodePrefix.trim() }
        : {}),
      ...(body.smtpHost !== undefined ? { smtpHost: body.smtpHost } : {}),
      ...(body.smtpPort !== undefined ? { smtpPort: body.smtpPort } : {}),
      ...(body.smtpUser !== undefined ? { smtpUser: body.smtpUser } : {}),
      ...(body.smtpPassword ? { smtpPassword: body.smtpPassword } : {}),
      ...(body.smtpFrom !== undefined ? { smtpFrom: body.smtpFrom } : {}),
      ...(body.alertEmailEnabled !== undefined ? { alertEmailEnabled: body.alertEmailEnabled } : {}),
      ...(body.alertOfflineMinutes !== undefined ? { alertOfflineMinutes: body.alertOfflineMinutes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .returning();
  res.json(serialize(updated[0]!));
});

// Download the companion bridge package — redirect to the public static path
// so both the old /api/settings/bridge-download URL and the new
// /api/download/powerhub-bridge.zip URL serve the same file.
router.get("/bridge-download", (_req, res) => {
  res.redirect("/api/download/powerhub-bridge.zip");
});

export default router;
