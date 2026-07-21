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
    // Never disclose the stored secret; expose only whether one is set so the
    // UI can render a placeholder without leaking broker credentials.
    mqttPasswordSet: !!r.mqttPassword,
    mqttBaseTopic: r.mqttBaseTopic,
    mqttUseTls: r.mqttUseTls,
    propertyCodeMode: r.propertyCodeMode,
    propertyCodePrefix: r.propertyCodePrefix,
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
      updatedAt: new Date(),
    })
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .returning();
  res.json(serialize(updated[0]!));
});

// Download the companion bridge package (any authenticated user — needed by
// whoever sets up the on-site PC, from anywhere).
router.get("/bridge-download", (_req, res) => {
  const candidates = [
    path.resolve(import.meta.dirname, "../../assets/powerhub-bridge.zip"),
    path.resolve(import.meta.dirname, "../../../../companion/powerhub-bridge.zip"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    res.status(404).json({ error: "Bridge package not available" });
    return;
  }
  res.download(file, "powerhub-bridge.zip");
});

export default router;
