import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  controlsTable,
  controlTypesTable,
  devicesTable,
  powerLogsTable,
  processTypesTable,
  roomsTable,
} from "@workspace/db";
import { requireApiKey } from "../lib/apiKeyAuth";
import { enqueueControlChange } from "../lib/powerQueue";
import { validateBody } from "../lib/http";

// ---------------------------------------------------------------------------
// External-facing endpoints:
//  1. MHMS command API (API-key auth): POST /integration/power/commands
//  2. Relay-box poll/ack (no auth, matches legacy firmware paths):
//     GET /PowerDeviceApi/:deviceCode
//     GET /PowerDeviceStatusApi/:deviceCode/:randomNo
// ---------------------------------------------------------------------------

const CommandBody = z.object({
  roomNo: z.string().min(1),
  state: z.enum(["on", "off"]),
  // Process master reference: numeric id or exact name (e.g. "Checkin").
  process: z.union([z.number().int(), z.string()]).optional(),
  // Restrict to specific load types, e.g. ["Light","AC"]. Omit = all controls
  // mapped to the room.
  controlTypes: z.array(z.string()).optional(),
  grcNo: z.string().optional(),
  billNo: z.string().optional(),
  guestName: z.string().optional(),
  username: z.string().optional(),
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
      and(eq(roomsTable.propertyId, propertyId), eq(roomsTable.roomNo, body.roomNo)),
    )
    .limit(1);
  const room = rooms[0];
  if (!room) {
    res.status(404).json({ error: `Room ${body.roomNo} not found` });
    return;
  }

  // Resolve process type (optional).
  let processType = null;
  if (body.process !== undefined) {
    const cond =
      typeof body.process === "number"
        ? eq(processTypesTable.id, body.process)
        : eq(processTypesTable.name, body.process);
    const found = await db
      .select()
      .from(processTypesTable)
      .where(and(eq(processTypesTable.propertyId, propertyId), cond))
      .limit(1);
    if (!found[0]) {
      res.status(400).json({ error: `Unknown process: ${body.process}` });
      return;
    }
    processType = found[0];
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
    res.status(400).json({ error: `No controls mapped to room ${body.roomNo}` });
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
        error: `Room ${body.roomNo} has no controls of type(s): ${body.controlTypes.join(", ")}`,
      });
      return;
    }
  }

  const state = body.state === "on" ? 1 : 0;
  const logIds = await enqueueControlChange(
    targets.map((t) => t.control),
    state as 0 | 1,
    {
      processType,
      source: "mhms",
      grcNo: body.grcNo ?? null,
      billNo: body.billNo ?? null,
      guestName: body.guestName ?? null,
      requestedBy: body.username ?? null,
    },
  );

  res.status(202).json({
    queued: logIds.length,
    powerLogIds: logIds,
    room: body.roomNo,
    state: body.state,
    controls: targets.map((t) => ({
      id: t.control.id,
      label: t.control.label,
      type: t.typeName,
    })),
    process: processType?.name ?? null,
    autoCutoffMinutes:
      state === 1 && processType?.isAuto ? processType.cutoffMinutes : null,
  });
});

// --------------------------- device poll / ack -----------------------------

export const deviceRouter: IRouter = Router();

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
deviceRouter.get("/PowerDeviceApi/:deviceCode", async (req, res) => {
  const code = req.params.deviceCode;
  const devices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.code, code))
    .limit(1);
  const device = devices[0];
  if (!device) {
    res.status(404).type("text/plain").send("UNKNOWN");
    return;
  }
  // Bridge forwards the box's LAN IP in x-device-ip; record it when present.
  const reportedIp =
    typeof req.headers["x-device-ip"] === "string" &&
    req.headers["x-device-ip"].length > 0 &&
    req.headers["x-device-ip"].length <= 45
      ? req.headers["x-device-ip"]
      : undefined;
  await db
    .update(devicesTable)
    .set({ lastSeenAt: new Date(), ...(reportedIp ? { reportedIp } : {}) })
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
  const p = pending[0];
  // Exact legacy format: Device.Controlpush.Controlpull.'#'.RRRR.'+'
  // (no separators between fields; randomNo zero-padded to 4 digits).
  const rand = String(p.randomNo).padStart(4, "0");
  res
    .type("text/plain")
    .send(`${device.code}${p.controlPush}${p.controlPull}#${rand}+`);
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
    const devices = await db
      .select()
      .from(devicesTable)
      .where(eq(devicesTable.code, code))
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
