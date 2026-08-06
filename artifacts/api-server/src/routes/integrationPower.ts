import net from "node:net";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  controlsTable,
  controlTypesTable,
  devicesTable,
  powerLogsTable,
  processTypesTable,
  propertiesTable,
  roomsTable,
} from "@workspace/db";
import type { Request } from "express";

// Resolve which property a bridge request belongs to.
// Preferred: x-property-code header (new bridge) — the hotel's short code
// (e.g. "KDS"), matched case-insensitively against properties.code.
// Fallback: x-property-id numeric header (older bridge builds).
// Returns null when neither header is usable (legacy bridge → heuristic).
async function resolveBridgePropertyId(req: Request): Promise<number | null> {
  const codeHeader = req.headers["x-property-code"];
  if (typeof codeHeader === "string" && codeHeader.trim()) {
    const propCode = codeHeader.trim();
    const rows = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(sql`lower(${propertiesTable.code}) = lower(${propCode})`)
      .limit(1);
    if (rows[0]) return rows[0].id;
    // Unknown property code — treat as unresolved rather than silently
    // falling back, so the caller can decide (poll returns UNKNOWN).
    return -1;
  }
  const idHeader = req.headers["x-property-id"];
  if (typeof idHeader === "string" && /^\d+$/.test(idHeader.trim())) {
    return parseInt(idHeader.trim(), 10);
  }
  return null;
}
import { requireApiKey } from "../lib/apiKeyAuth";
import { getOfflineThresholdMinutes } from "../lib/settings";
import { enqueueControlChange, buildPush, buildPull } from "../lib/powerQueue";
import { validateBody } from "../lib/http";

// ---------------------------------------------------------------------------
// External-facing endpoints:
//  1. MHMS command API (API-key auth): POST /integration/power/commands
//  2. Relay-box poll/ack (no auth, matches legacy firmware paths):
//     GET /PowerDeviceApi/:deviceCode
//     GET /PowerDeviceStatusApi/:deviceCode/:randomNo
// ---------------------------------------------------------------------------

// Official M-HMS payload (v1.0 spec)
const CommandBody = z.object({
  roomNumber:   z.string().min(1),
  action:       z.enum(["ON", "OFF"]),
  // Restrict to specific load types, e.g. ["Light","AC"]. Empty = all controls.
  controlTypes: z.array(z.string()).optional(),
  // Lifecycle event name — mapped to a PowerHub process type (checkin, checkout, etc.)
  event:        z.string().optional(),
  hotelId:      z.string().optional(),
  grcNo:        z.string().optional(),
  guestName:    z.string().optional(),
  timestamp:    z.string().optional(),
});

export const mhmsRouter: IRouter = Router();

mhmsRouter.post("/commands", requireApiKey, async (req, res) => {
  const body = validateBody(CommandBody, req, res);
  if (!body) return;
  const propertyId = req.apiKey!.propertyId;

  const rooms = await db
    .select()
    .from(roomsTable)
    .where(
      and(eq(roomsTable.propertyId, propertyId), eq(roomsTable.roomNo, body.roomNumber)),
    )
    .limit(1);
  const room = rooms[0];
  if (!room) {
    res.status(404).json({ error: `Room ${body.roomNumber} not found` });
    return;
  }

  // Resolve process type from event name (e.g. "visiting" → process named "Visiting").
  // Match is case-insensitive so MHMS event names like "visiting" match a DB row named
  // "Visiting" (or any other casing the admin typed). Without this, cutoffDueAt stays
  // null and the auto-cutoff sweep never fires for visiting/cleaning sessions.
  let processType = null;
  let processTypeWarning: string | null = null;
  if (body.event) {
    const eventTrimmed = body.event.trim();
    const found = await db
      .select()
      .from(processTypesTable)
      .where(
        and(
          eq(processTypesTable.propertyId, propertyId),
          sql`lower(${processTypesTable.name}) = lower(${eventTrimmed})`,
        ),
      )
      .limit(1);
    if (found[0]) {
      processType = found[0];
      // Warn if the process type exists but has no auto-cutoff configured — the caller
      // might expect a timer but will get none.
      if (processType.isAuto && processType.cutoffMinutes <= 0) {
        processTypeWarning = `Process type "${processType.name}" has isAuto=true but cutoffMinutes=0 — no timer will fire. Set cutoffMinutes > 0 in Masters → Process Types.`;
      }
    } else {
      // Soft-fail but surface in response so the caller can detect mismatches.
      processTypeWarning = `No process type named "${eventTrimmed}" found for this property. Auto-cutoff will NOT fire. Create it in Masters → Process Types with isAuto=true and a cutoffMinutes value.`;
    }
  }

  // Room controls, optionally filtered by control type names.
  const roomControls = await db
    .select({
      control: controlsTable,
      typeName: controlTypesTable.name,
    })
    .from(controlsTable)
    .leftJoin(
      controlTypesTable,
      eq(controlsTable.controlTypeId, controlTypesTable.id),
    )
    .where(
      and(eq(controlsTable.propertyId, propertyId), eq(controlsTable.roomId, room.id)),
    );
  if (roomControls.length === 0) {
    res.status(400).json({ error: `No controls mapped to room ${body.roomNumber}` });
    return;
  }
  let targets = roomControls;
  if (body.controlTypes && body.controlTypes.length > 0) {
    const wanted = body.controlTypes.map((t) => t.toLowerCase());
    targets = roomControls.filter(
      (rc) => rc.typeName && wanted.includes(rc.typeName.toLowerCase()),
    );
    if (targets.length === 0) {
      res.status(400).json({
        error: `Room ${body.roomNumber} has no controls of type(s): ${body.controlTypes.join(", ")}`,
      });
      return;
    }
  }

  const state = body.action === "ON" ? 1 : 0;
  const logIds = await enqueueControlChange(
    targets.map((t) => t.control),
    state as 0 | 1,
    {
      processType,
      source: "mhms",
      grcNo:       body.grcNo     ?? null,
      billNo:      null,
      guestName:   body.guestName ?? null,
      requestedBy: null,
    },
  );

  // M-HMS expects 202 Accepted on success.
  res.status(202).json({
    queued:      logIds.length,
    powerLogIds: logIds,
    room:        body.roomNumber,
    action:      body.action,
    event:       body.event ?? null,
    controls:    targets.map((t) => ({ id: t.control.id, label: t.control.label, type: t.typeName })),
    process:     processType?.name ?? null,
    autoCutoffMinutes: state === 1 && processType?.isAuto && (processType.cutoffMinutes ?? 0) > 0
      ? processType.cutoffMinutes
      : null,
    // Non-null when the event name didn't resolve or the process type has no timer configured.
    // Check this field in MHMS logs to diagnose missing auto-cutoff.
    warning: processTypeWarning ?? undefined,
  });
});

// --------------------------- device poll / ack -----------------------------

export const deviceRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Inter-command delay
// ---------------------------------------------------------------------------
// When a transfer queues two commands for the same device (e.g. *0X00 to
// clear room 103 then *0X26 to set room 106), the relay board can ack the
// first and immediately poll for the second within milliseconds.  The relay
// contacts physically haven't had time to open before the next bitmask
// re-energises the same channel — so the old room stays ON.
//
// Fix: after a command is acked, the poll handler checks the most-recently
// delivered command's receivedAt from the DB.  If it is within
// RELAY_SETTLE_MS we return empty so the board retries on its next cycle.
//
// Using the DB (not an in-memory map) means the gap survives server
// restarts — previously the in-memory map was cleared on every PM2 restart
// or deploy, causing the first transfer after any restart to skip the delay.
const RELAY_SETTLE_MS = 5_000; // 5 s — conservative relay settle window

// Simple in-memory rate limiter for the unauthenticated device endpoints:
// max 30 requests per device-code+IP per 10 s window. Real boxes poll every
// few seconds; this mainly blunts randomNo brute-forcing on the ack path.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function deviceRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 10_000 });
    return true;
  }
  bucket.count += 1;
  if (rateBuckets.size > 10_000) rateBuckets.clear();
  return bucket.count <= 30;
}
deviceRouter.use("/PowerDeviceApi", (req, res, next) => {
  if (!deviceRateLimit(`${req.ip}:${req.path}`)) {
    res.status(429).type("text/plain").send("SLOWDOWN");
    return;
  }
  next();
});
deviceRouter.use("/PowerDeviceStatusApi", (req, res, next) => {
  // Key by device code only (first path segment) — keying on the full path
  // would let an attacker dodge the limiter by varying the randomNo segment.
  const deviceCode = req.path.split("/")[1] ?? "";
  if (!deviceRateLimit(`${req.ip}:PowerDeviceStatusApi:${deviceCode}`)) {
    res.status(429).type("text/plain").send("SLOWDOWN");
    return;
  }
  next();
});

// Legacy poll: returns "DEVICE+push+pull#RRRR+" for the oldest pending command,
// or "NOCMD" when the queue is empty. Also serves as the heartbeat.
//
// Device resolution strategy (in priority order):
//  1. x-property-code header (new bridge): resolve property by its short
//     code (e.g. "KDS"), then exact device lookup by (code, property_id).
//  2. x-property-id header (older bridge builds): same, by numeric ID.
//  3. No header (legacy bridge): fall back to heuristic — prefer the device
//     that has a pending command; if several do, pick the oldest command;
//     if none do, pick by id asc so at least one device gets its heartbeat.
deviceRouter.get("/PowerDeviceApi/:deviceCode", async (req, res) => {
  const code = req.params.deviceCode;

  // --- Strategy 1/2: property-scoped lookup (bridge identifies its property) ---
  const bridgePropertyId = await resolveBridgePropertyId(req);
  if (bridgePropertyId === -1) {
    // Bridge sent a property code the server doesn't know — misconfiguration.
    res.status(404).type("text/plain").send("UNKNOWN");
    return;
  }

  let device: typeof devicesTable.$inferSelect | undefined;

  if (bridgePropertyId) {
    const rows = await db
      .select()
      .from(devicesTable)
      .where(
        and(eq(devicesTable.code, code), eq(devicesTable.propertyId, bridgePropertyId)),
      )
      .limit(1);
    device = rows[0];
    if (!device) {
      res.status(404).type("text/plain").send("UNKNOWN");
      return;
    }
  } else {
    // --- Strategy 2: global lookup with heuristic (old bridge, no header) ---
    const allDevices = await db
      .select()
      .from(devicesTable)
      .where(eq(devicesTable.code, code));
    if (allDevices.length === 0) {
      res.status(404).type("text/plain").send("UNKNOWN");
      return;
    }
    device = allDevices[0]!;
    if (allDevices.length > 1) {
      const deviceIds = allDevices.map((d) => d.id);
      const pendingRows = await db
        .select({ deviceId: powerLogsTable.deviceId })
        .from(powerLogsTable)
        .where(and(inArray(powerLogsTable.deviceId, deviceIds), eq(powerLogsTable.flag, 0)))
        .orderBy(asc(powerLogsTable.id))
        .limit(1);
      if (pendingRows[0]) {
        device = allDevices.find((d) => d.id === pendingRows[0]!.deviceId) ?? device;
      }
    }
  }
  // -------------------------------------------------------------------------
  // Power-resume: if this box was OFFLINE (power cut / reboot) and is polling
  // again, its relays came up in the hardware default state — NOT what the
  // server believes. Queue a state-resume command rebuilt from the live
  // control states so the box restores every relay to its last known state.
  // Only needed when the queue is empty: any pending command already carries
  // the full live bitmask (the poll re-derives it at delivery time), so
  // pending commands double as the resume and then proceed as usual.
  // -------------------------------------------------------------------------
  const offlineMins = await getOfflineThresholdMinutes();
  const wasOffline =
    !device.isOnline ||
    (!!device.lastSeenAt &&
      Date.now() - device.lastSeenAt.getTime() > offlineMins * 60_000);
  if (wasOffline) {
    // Status record: box reported back in — visible in the command report.
    await db.insert(powerLogsTable).values({
      propertyId: device.propertyId,
      deviceId: device.id,
      deviceCode: device.code,
      roomId: null,
      controlId: null,
      processTypeId: null,
      state: 1,
      controlPush: "-",
      controlPull: "-",
      randomNo: 0,
      flag: 1, // status record only — never served as a command
      source: "box-online",
      requestedBy: "system (status monitor)",
      receivedAt: new Date(),
    });
    const hasPending = await db
      .select({ id: powerLogsTable.id })
      .from(powerLogsTable)
      .where(and(eq(powerLogsTable.deviceId, device.id), eq(powerLogsTable.flag, 0)))
      .limit(1);
    if (!hasPending[0]) {
      const allControls = await db
        .select()
        .from(controlsTable)
        .where(eq(controlsTable.deviceId, device.id));
      // Only resume if at least one control should be ON — if everything is
      // OFF, the hardware default (all relays de-energised) may differ per
      // wiring, so still send the explicit OFF mask to be deterministic.
      if (allControls.length > 0) {
        const randomNo = 1000 + Math.floor(Math.random() * 9000);
        await db.insert(powerLogsTable).values({
          propertyId: device.propertyId,
          deviceId: device.id,
          deviceCode: device.code,
          roomId: null,
          controlId: null,
          processTypeId: null,
          state: allControls.some((c) => c.state === 1) ? 1 : 0,
          controlPush: buildPush(allControls),
          controlPull: buildPull(allControls),
          randomNo,
          flag: 0,
          source: "power-resume",
          requestedBy: "system (power restored)",
        });
        console.log(
          `[power-resume] ${device.code} (property ${device.propertyId}) back online after ${Math.round((Date.now() - device.lastSeenAt!.getTime()) / 60_000)} min — queued state restore ${buildPush(allControls)}${buildPull(allControls)}`,
        );
      }
    }
  }

  // Bridge forwards the box's LAN IP in x-device-ip; record it when present.
  // Strictly validate as an IP address (net.isIP) — this endpoint is
  // unauthenticated legacy-protocol, so never persist arbitrary strings.
  const deviceIpHeader = req.headers["x-device-ip"];
  const reportedIp =
    typeof deviceIpHeader === "string" && net.isIP(deviceIpHeader) !== 0
      ? deviceIpHeader
      : undefined;
  const ipChanged = !!reportedIp && reportedIp !== device.reportedIp;
  // Bridge also reports the chip's setup-hotspot config-page IP it detected
  // while the operator's PC was on the config WiFi (x-setup-ip header).
  const setupIpHeader = req.headers["x-setup-ip"];
  const setupIp =
    typeof setupIpHeader === "string" && net.isIP(setupIpHeader) === 4
      ? setupIpHeader
      : undefined;
  await db
    .update(devicesTable)
    .set({
      lastSeenAt: new Date(),
      isOnline: true,
      ...(reportedIp ? { reportedIp } : {}),
      ...(ipChanged && device.reportedIp
        ? { previousReportedIp: device.reportedIp }
        : {}),
      ...(setupIp && setupIp !== device.setupIp ? { setupIp } : {}),
    })
    .where(eq(devicesTable.id, device.id));

  const pending = await db
    .select()
    .from(powerLogsTable)
    .where(and(eq(powerLogsTable.deviceId, device.id), eq(powerLogsTable.flag, 0)))
    .orderBy(asc(powerLogsTable.id))
    .limit(1);
  if (!pending[0]) {
    // Legacy PHP echoed nothing when the queue was empty — the firmware
    // treats an empty body as "no command". Do NOT send "NOCMD".
    res.type("text/plain").send("");
    return;
  }

  // Inter-command relay settle delay: check the most recently delivered
  // command for this device.  If it was acked within RELAY_SETTLE_MS, return
  // empty so the board retries on its next poll cycle.
  //
  // We query the DB rather than an in-memory map so the gap survives server
  // restarts — the in-memory approach silently skipped the delay after every
  // PM2 restart or deploy, causing intermittent transfer failures.
  const lastDelivered = await db
    .select({ receivedAt: powerLogsTable.receivedAt })
    .from(powerLogsTable)
    .where(
      and(
        eq(powerLogsTable.deviceId, device.id),
        eq(powerLogsTable.flag, 1),
        // Status records (box-online / box-offline) are not relay commands —
        // they must not trigger the inter-command settle delay.
        sql`${powerLogsTable.source} NOT IN ('box-online', 'box-offline')`,
      ),
    )
    .orderBy(desc(powerLogsTable.id))
    .limit(1);
  const lastAckedAt = lastDelivered[0]?.receivedAt;
  if (lastAckedAt && Date.now() - lastAckedAt.getTime() < RELAY_SETTLE_MS) {
    // Tell the board "nothing yet" — it will retry on its next poll cycle.
    res.type("text/plain").send("");
    return;
  }

  const p = pending[0];
  // Re-derive the relay bitmask from live control states rather than using
  // the snapshot stored at enqueue time.
  //
  // Race condition: when MHMS sends checkout (room A) + checkin (room B)
  // simultaneously, two DB transactions run concurrently.  Transaction B
  // reads the device's controls BEFORE transaction A commits, so it sees
  // room A still state=1 and bakes that into controlPush.  The settle delay
  // then correctly spaces the two commands 5 s apart — but the ON command
  // still carries room A's bit, re-energising its relay after it went dark.
  //
  // By re-reading the controls here (after both transactions have committed
  // and the settle window has elapsed) we always deliver a bitmask that
  // reflects the true current state.
  const liveControls = await db
    .select()
    .from(controlsTable)
    .where(eq(controlsTable.deviceId, device.id));
  const livePush = buildPush(liveControls);
  const livePull = buildPull(liveControls);
  const rand = String(p.randomNo).padStart(4, "0");
  const cmd = `${device.code}${livePush}${livePull}#${rand}+`;
  // Log both so we can spot any residual stale-snapshot divergence.
  if (livePush !== p.controlPush || livePull !== p.controlPull) {
    console.log(`[poll] ${device.code} → ${cmd}  (stored: ${p.controlPush}${p.controlPull} — stale snapshot corrected)`);
  } else {
    console.log(`[poll] ${device.code} → ${cmd}`);
  }
  res.type("text/plain").send(cmd);
});

// Some firmware states ack with an empty randomNo (e.g. after a failed parse).
// Answer 'Succss' so the box unsticks and resumes normal polling.
deviceRouter.get("/PowerDeviceStatusApi/:deviceCode", (_req, res) => {
  res.type("text/plain").send("Succss");
});

// Legacy ack: box confirms it applied the command carrying this randomNo.
deviceRouter.get(
  "/PowerDeviceStatusApi/:deviceCode/:randomNo",
  async (req, res) => {
    const code = req.params.deviceCode;
    const randomNo = Number(req.params.randomNo);
    if (!Number.isInteger(randomNo)) {
      res.status(400).type("text/plain").send("BADREQ");
      return;
    }
    // Use x-property-code / x-property-id (new bridge) for exact lookup;
    // fall back to LIMIT 1 for legacy bridges.
    const bridgePropertyId = await resolveBridgePropertyId(req);
    if (bridgePropertyId === -1) {
      res.status(404).type("text/plain").send("UNKNOWN");
      return;
    }
    const whereClause = bridgePropertyId
      ? and(eq(devicesTable.code, code), eq(devicesTable.propertyId, bridgePropertyId))
      : eq(devicesTable.code, code);
    const devices = await db
      .select()
      .from(devicesTable)
      .where(whereClause)
      .limit(1);
    const device = devices[0];
    if (!device) {
      res.status(404).type("text/plain").send("UNKNOWN");
      return;
    }
    const now = new Date();
    const pendingIds = await db
      .select({ id: powerLogsTable.id })
      .from(powerLogsTable)
      .where(
        and(
          eq(powerLogsTable.deviceId, device.id),
          eq(powerLogsTable.randomNo, randomNo),
          eq(powerLogsTable.flag, 0),
        ),
      );
    if (pendingIds.length === 0) {
      // Legacy PHP always echoed 'Succss' regardless of match.
      res.type("text/plain").send("Succss");
      return;
    }
    await db
      .update(powerLogsTable)
      .set({ flag: 1, receivedAt: now, closedAt: now })
      .where(
        inArray(
          powerLogsTable.id,
          pendingIds.map((r) => r.id),
        ),
      );
    await db
      .update(devicesTable)
      .set({ lastSeenAt: now })
      .where(eq(devicesTable.id, device.id));

    // Legacy firmware expects the literal (misspelled) 'Succss' ack response.
    res.type("text/plain").send("Succss");
  },
);
