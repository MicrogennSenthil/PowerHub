import { db, devicesTable, powerLogsTable, appUsersTable, userPropertiesTable, systemSettingsTable } from "@workspace/db";
import { eq, lt, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendMail } from "../lib/mailer";
import { SETTINGS_ID, getOfflineThresholdMinutes } from "../lib/settings";

// ---------------------------------------------------------------------------
// Status sweep — runs every 30s. Any ONLINE device that hasn't polled within
// the offline threshold gets flipped to offline, and a `box-offline` record
// is written into power_logs so the command report shows exactly when each
// box went dark. The matching `box-online` record is written by the poll
// endpoint the moment the box reports back in.
// ---------------------------------------------------------------------------
export async function sweepDeviceStatus(): Promise<number> {
  const thresholdMinutes = await getOfflineThresholdMinutes();
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  const wentOffline = await db
    .update(devicesTable)
    .set({ isOnline: false })
    .where(
      and(
        eq(devicesTable.active, true),
        eq(devicesTable.isOnline, true),
        lt(devicesTable.lastSeenAt, cutoff),
      ),
    )
    .returning();

  for (const device of wentOffline) {
    await db.insert(powerLogsTable).values({
      propertyId: device.propertyId,
      deviceId: device.id,
      deviceCode: device.code,
      roomId: null,
      controlId: null,
      processTypeId: null,
      state: 0,
      controlPush: "-",
      controlPull: "-",
      randomNo: 0,
      flag: 1, // never a pending command — status record only
      source: "box-offline",
      requestedBy: "system (status monitor)",
      receivedAt: new Date(),
    });
    logger.warn(
      { deviceId: device.id, code: device.code, propertyId: device.propertyId, lastSeenAt: device.lastSeenAt },
      "Device went OFFLINE — status logged",
    );
  }
  return wentOffline.length;
}

// Track which devices have already triggered an alert in the current offline
// window so we don't spam every check interval.
const alertedDevices = new Set<number>();

async function runCheck() {
  const settingsRows = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  const settings = settingsRows[0];
  if (!settings?.alertEmailEnabled) return;

  const thresholdMinutes = settings.alertOfflineMinutes ?? 10;
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  // Find devices that haven't polled recently
  const offlineDevices = await db
    .select()
    .from(devicesTable)
    .where(
      and(
        eq(devicesTable.active, true),
        lt(devicesTable.lastSeenAt, cutoff),
      ),
    );

  for (const device of offlineDevices) {
    if (alertedDevices.has(device.id)) continue; // already alerted this window

    // Collect recipient emails: property admins + all superadmins
    const [propUsers, superAdmins] = await Promise.all([
      db
        .select({ email: appUsersTable.email })
        .from(appUsersTable)
        .innerJoin(userPropertiesTable, eq(userPropertiesTable.userId, appUsersTable.id))
        .where(
          and(
            eq(userPropertiesTable.propertyId, device.propertyId),
            eq(appUsersTable.active, true),
          ),
        ),
      db
        .select({ email: appUsersTable.email })
        .from(appUsersTable)
        .where(
          and(
            eq(appUsersTable.isSuperAdmin, true),
            eq(appUsersTable.active, true),
          ),
        ),
    ]);

    // Also include SUPER_ADMIN_EMAILS env override
    const envSuperAdmins = (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    const recipients = [
      ...new Set([
        ...propUsers.map((u) => u.email),
        ...superAdmins.map((u) => u.email),
        ...envSuperAdmins,
      ]),
    ].filter(Boolean) as string[];

    if (recipients.length === 0) continue;

    const lastSeen = device.lastSeenAt
      ? new Date(device.lastSeenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      : "Never";

    try {
      await sendMail(settings, {
        to: recipients,
        subject: `⚠️ PowerHub Alert — Device ${device.code} is OFFLINE`,
        text: [
          `PowerHub Device Offline Alert`,
          ``,
          `Device  : ${device.code}${device.description ? ' — ' + device.description : ''}`,
          `Last seen: ${lastSeen} IST`,
          `Offline for: more than ${thresholdMinutes} minutes`,
          ``,
          `Please check the companion bridge PC and the relay box.`,
          ``,
          `— PowerHub`,
        ].join("\n"),
        html: `
          <div style="font-family:sans-serif;max-width:480px">
            <h2 style="color:#dc2626">⚠️ Device Offline Alert</h2>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:4px 8px;font-weight:bold">Device</td><td style="padding:4px 8px">${device.code}${device.description ? ' — ' + device.description : ''}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Last seen</td><td style="padding:4px 8px">${lastSeen} IST</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Offline for</td><td style="padding:4px 8px">More than ${thresholdMinutes} minutes</td></tr>
            </table>
            <p style="margin-top:16px;color:#555">Please check the companion bridge PC and the relay box.</p>
            <p style="color:#999;font-size:12px">— PowerHub</p>
          </div>`,
      });
      alertedDevices.add(device.id);
      logger.info({ deviceId: device.id, code: device.code, recipients }, "Device offline alert sent");
    } catch (err) {
      logger.warn({ err, deviceId: device.id }, "Failed to send device offline alert");
    }
  }

  // Clear alerted set for devices that are back online
  for (const id of alertedDevices) {
    const device = offlineDevices.find((d) => d.id === id);
    if (!device) alertedDevices.delete(id); // back online
  }
}

export function startDeviceMonitor() {
  // Status sweep: every 30s — flips is_online and writes box-offline records.
  setInterval(() => {
    sweepDeviceStatus().catch((err) =>
      logger.warn({ err }, "deviceMonitor: status sweep failed"),
    );
  }, 30 * 1000);

  // Email alerts: every 2 minutes; alert fires only when threshold is exceeded
  const INTERVAL_MS = 2 * 60 * 1000;
  setInterval(() => {
    runCheck().catch((err) =>
      logger.warn({ err }, "deviceMonitor: check failed"),
    );
  }, INTERVAL_MS);
  logger.info("Device status monitor started (30s sweep + email alerts)");
}
