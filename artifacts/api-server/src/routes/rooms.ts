import { Router, type IRouter } from "express";
import { eq, asc, desc, and, inArray, ilike, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  roomsTable,
  blocksTable,
  floorsTable,
  roomTypesTable,
  controlsTable,
  controlTypesTable,
  devicesTable,
  propertiesTable,
  powerLogsTable,
  processTypesTable,
} from "@workspace/db";
import { CreateRoomBody, UpdateRoomBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";
import { refBelongsToProperty } from "../lib/integrity";
import { getOfflineThresholdMinutes } from "../lib/settings";
import { isDeviceOnline } from "../lib/serialize";
import { enqueueControlChange } from "../lib/powerQueue";
import { parseHmsOccupancyBody, type HmsOccupancyRoom } from "../lib/hmsOccupancy";
import type { Response } from "express";

/**
 * Normalise a user-supplied MHMS base URL.
 *
 * Handles two common entry mistakes:
 *  1. Missing scheme  — "microgenn.in/..."  → "https://microgenn.in/..."
 *  2. user@host form  — "rangees@microgenn.in" → "https://rangees.microgenn.in"
 *     The Fetch spec forbids requests to URLs that contain credentials
 *     (user:password@host).  Users typing "rangees@microgenn.in" intend the
 *     subdomain "rangees.microgenn.in", not a username.
 */
function normaliseBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  // Parse to detect embedded credentials introduced by the @ interpretation.
  try {
    const parsed = new URL(withScheme);
    if (parsed.username) {
      // Rebuild treating the "username" as a subdomain label.
      const port = parsed.port ? `:${parsed.port}` : "";
      const path = parsed.pathname !== "/" ? parsed.pathname : "";
      return `${parsed.protocol}//${parsed.username}.${parsed.hostname}${port}${path}`.replace(/\/+$/, "");
    }
  } catch {
    // Not a parseable URL — fall through and return as-is after stripping slash.
  }

  return withScheme.replace(/\/+$/, "");
}

// Some HMS installations send lifecycle labels such as "Visiting Mode" rather
// than the exact Process Master name "Visiting". Normalize both forms before
// deciding the relay state or looking up the process type.
function hmsProcessKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/mode$/, "");
}

// HMS status values that map to ON. Cleaning, Visiting and Maintenance are
// intentional: they are timed working modes, not vacant-room statuses.
const HMS_ON_STATUSES = new Set([
  "occupied", "checkin", "walkin", "group", "transfer", "partialcheckout",
  "visiting", "cleaning", "maintenance",
]);
// HMS status values that map to OFF (room is empty)
const HMS_OFF_STATUSES = new Set(["vacant", "checkout", "dirty", "inspect"]);

const router: IRouter = Router();

// Ensures each provided foreign key belongs to the same property. Returns true
// when a validation error was sent (caller should stop).
async function rejectForeignRefs(
  res: Response,
  propertyId: number,
  refs: { blockId?: number | null; floorId?: number | null; roomTypeId?: number | null },
): Promise<boolean> {
  if (
    refs.blockId != null &&
    !(await refBelongsToProperty(blocksTable, refs.blockId, propertyId))
  ) {
    res.status(400).json({ error: "blockId does not belong to this property" });
    return true;
  }
  if (
    refs.floorId != null &&
    !(await refBelongsToProperty(floorsTable, refs.floorId, propertyId))
  ) {
    res.status(400).json({ error: "floorId does not belong to this property" });
    return true;
  }
  if (
    refs.roomTypeId != null &&
    !(await refBelongsToProperty(roomTypesTable, refs.roomTypeId, propertyId))
  ) {
    res
      .status(400)
      .json({ error: "roomTypeId does not belong to this property" });
    return true;
  }
  return false;
}

const selection = {
  id: roomsTable.id,
  propertyId: roomsTable.propertyId,
  roomNo: roomsTable.roomNo,
  blockId: roomsTable.blockId,
  floorId: roomsTable.floorId,
  roomTypeId: roomsTable.roomTypeId,
  active: roomsTable.active,
  blockName: blocksTable.name,
  floorName: floorsTable.name,
  roomTypeName: roomTypesTable.name,
};

function withJoins() {
  return db
    .select(selection)
    .from(roomsTable)
    .leftJoin(blocksTable, eq(roomsTable.blockId, blocksTable.id))
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(roomTypesTable, eq(roomsTable.roomTypeId, roomTypesTable.id));
}

router.get("/", requirePermission("rooms.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await withJoins().where(eq(roomsTable.propertyId, propertyId));
  res.json(rows);
});

// Room chart: every room (with block/floor/type) plus its mapped controls and
// each control's live on/off state and whether the driving device is online.
// Powers the visual room-status board grouped by block/floor/room number.
// Fetch room list directly from MHMS and return a normalised preview so the
// frontend can show a diff before bulk-importing.
router.get("/mhms-preview", requirePermission("rooms.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const propRows = await db
    .select({ mhmsApiUrl: propertiesTable.mhmsApiUrl, mhmsApiKey: propertiesTable.mhmsApiKey })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, propertyId))
    .limit(1);
  const prop = propRows[0];
  if (!prop?.mhmsApiUrl) {
    res.status(400).json({ error: "MHMS API URL is not configured for this property. Set it in Settings → Property." });
    return;
  }

  // MHMS official endpoint: GET {base}/api/integration/power/rooms
  const base = normaliseBaseUrl(prop.mhmsApiUrl);
  const url = `${base}/api/integration/power/rooms`;

  let raw: unknown;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (prop.mhmsApiKey) headers["X-API-Key"] = prop.mhmsApiKey;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) {
      res.status(400).json({ error: `MHMS returned HTTP ${resp.status}. Check the API URL and key.` });
      return;
    }
    raw = await resp.json();
  } catch (err: any) {
    res.status(400).json({ error: `Could not reach MHMS: ${err.message}` });
    return;
  }

  // Response shape: { hotelId, hotelName, rooms: [ { roomNumber, roomType, block, floor } ] }
  const list: unknown[] = Array.isArray((raw as any)?.rooms) ? (raw as any).rooms : [];

  const rooms = list
    .map((item: any) => ({
      roomNo:       (item.roomNumber ?? "").toString().trim(),
      blockName:    (item.block      ?? "").toString().trim(),
      floorName:    (item.floor      ?? "").toString().trim(),
      roomTypeName: (item.roomType   ?? "").toString().trim(),
    }))
    .filter((r) => r.roomNo.length > 0);

  res.json(rooms);
});

router.get("/chart", requirePermission("rooms.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [roomRows, controlRows, latestLogs, threshold] = await Promise.all([
    withJoins().where(eq(roomsTable.propertyId, propertyId)),
    db
      .select({
        id: controlsTable.id,
        roomId: controlsTable.roomId,
        controlTypeId: controlsTable.controlTypeId,
        controlTypeName: controlTypesTable.name,
        label: controlsTable.label,
        state: controlsTable.state,
        deviceId: controlsTable.deviceId,
        deviceCode: devicesTable.code,
        lastSeenAt: devicesTable.lastSeenAt,
      })
      .from(controlsTable)
      .leftJoin(
        controlTypesTable,
        eq(controlsTable.controlTypeId, controlTypesTable.id),
      )
      .leftJoin(devicesTable, eq(controlsTable.deviceId, devicesTable.id))
      .where(eq(controlsTable.propertyId, propertyId))
      .orderBy(asc(controlsTable.slate), asc(controlsTable.channel)),
    // Latest process-relevant power log per room — gives us the CURRENT
    // process (if any) to display on the room card.
    // We ignore manual UI toggles (source='ui') so a quick manual switch never
    // clears an active checkin/visiting/cleaning badge — but we DO include
    // auto-cutoff and MHMS OFF events: once a session is ended (timer expired
    // or guest checked out) the badge must disappear, so the card reflects the
    // room's current status instead of a stale "last process".
    db
      .selectDistinctOn([powerLogsTable.roomId], {
        roomId: powerLogsTable.roomId,
        processName: processTypesTable.name,
        guestName: powerLogsTable.guestName,
        grcNo: powerLogsTable.grcNo,
        state: powerLogsTable.state,
        rdate: powerLogsTable.rdate,
      })
      .from(powerLogsTable)
      .leftJoin(
        processTypesTable,
        eq(powerLogsTable.processTypeId, processTypesTable.id),
      )
      .where(
        and(
          eq(powerLogsTable.propertyId, propertyId),
          ne(powerLogsTable.source, "ui"),
        ),
      )
      .orderBy(powerLogsTable.roomId, desc(powerLogsTable.rdate)),
    getOfflineThresholdMinutes(),
  ]);

  const byRoom = new Map<number, unknown[]>();
  for (const c of controlRows) {
    if (c.roomId == null) continue;
    const list = byRoom.get(c.roomId) ?? [];
    list.push({
      id: c.id,
      controlTypeId: c.controlTypeId,
      controlTypeName: c.controlTypeName,
      label: c.label,
      state: c.state,
      on: c.state !== 0,
      deviceId: c.deviceId,
      deviceCode: c.deviceCode,
      deviceOnline: isDeviceOnline(c.lastSeenAt, threshold),
    });
    byRoom.set(c.roomId, list);
  }

  // Index latest power log by roomId
  const logByRoom = new Map<number, typeof latestLogs[number]>();
  for (const l of latestLogs) {
    if (l.roomId != null) logByRoom.set(l.roomId, l);
  }

  res.json(
    roomRows.map((r) => {
      const log = logByRoom.get(r.id);
      // A process badge is only "current" while the session is live (the
      // latest non-UI event turned power ON). An OFF event — auto-cutoff after
      // a Visiting/Cleaning timer or an MHMS Checkout — ends the session, so
      // the room shows its current status (vacant) instead of a stale process.
      const active = log != null && log.state === 1;
      return {
        ...r,
        controls: byRoom.get(r.id) ?? [],
        lastProcessName: active ? (log.processName ?? null) : null,
        lastGuestName: active ? (log.guestName ?? null) : null,
        lastGrcNo: active ? (log.grcNo ?? null) : null,
        lastEventAt: log?.rdate?.toISOString() ?? null,
      };
    }),
  );
});

// HMS occupancy sync: fetch current room statuses from the configured MHMS
// endpoint and queue ON/OFF relay commands to match. Source = "hms-sync" so
// the power-usage report can filter specifically for these batches.
router.post(
  "/hms-sync",
  requirePermission("controls.manage"),
  async (req, res) => {
    const propertyId =
      typeof req.body?.propertyId === "number" ? req.body.propertyId : null;
    if (propertyId === null) {
      res.status(400).json({ error: "propertyId is required" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const propRows = await db
      .select({
        mhmsApiUrl: propertiesTable.mhmsApiUrl,
        mhmsApiKey: propertiesTable.mhmsApiKey,
      })
      .from(propertiesTable)
      .where(eq(propertiesTable.id, propertyId))
      .limit(1);
    const prop = propRows[0];
    if (!prop?.mhmsApiUrl) {
      res.status(400).json({
        error:
          "MHMS API URL is not configured for this property. Set it in Settings → Property.",
      });
      return;
    }

    // Fetch current occupancy from MHMS.
    // Expected response: { rooms: [{ roomNumber, status, grcNo?, guestName?, billNo? }] }
    const base = normaliseBaseUrl(prop.mhmsApiUrl);
    const url = `${base}/api/integration/power/occupancy`;
    let rawRooms: HmsOccupancyRoom[] = [];

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (prop.mhmsApiKey) headers["X-API-Key"] = prop.mhmsApiKey;
      const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      const body = await resp.text();
      if (!resp.ok) {
        const error =
          resp.status === 401 || resp.status === 403
            ? "MHMS rejected the API key. Save the same key used in M-HMS Power Automation under Settings → Properties."
            : `MHMS returned HTTP ${resp.status}. Check the MHMS Server URL and API key.`;
        res.status(400).json({ error });
        return;
      }

      const parsed = parseHmsOccupancyBody(body, resp.headers.get("content-type"));
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      rawRooms = parsed.rooms;
    } catch (err: any) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      res.status(400).json({
        error: timedOut
          ? "MHMS did not respond within 15 seconds. Check the MHMS Server URL."
          : "Could not reach MHMS. Check the MHMS Server URL and network connection.",
      });
      return;
    }

    // Load all rooms and process types for the property in parallel.
    const [propertyRooms, propertyProcessTypes] = await Promise.all([
      db
        .select({ id: roomsTable.id, roomNo: roomsTable.roomNo })
        .from(roomsTable)
        .where(eq(roomsTable.propertyId, propertyId)),
      db
        .select()
        .from(processTypesTable)
        .where(eq(processTypesTable.propertyId, propertyId)),
    ]);
    const roomByNo = new Map(propertyRooms.map((r) => [r.roomNo.toLowerCase(), r.id]));
    // Case-insensitive map: lower(name) → process type row.
    // Used to attach a process type to HMS-sync commands so the command log
    // and room chart activity badge show the correct process name (e.g. "Checkin").
    const processTypeByName = new Map(
      propertyProcessTypes.map((pt) => [hmsProcessKey(pt.name), pt]),
    );

    // Load all controls for the property to enqueue commands.
    const allControls = await db
      .select()
      .from(controlsTable)
      .where(eq(controlsTable.propertyId, propertyId));
    const controlsByRoom = new Map<number, typeof allControls>();
    for (const c of allControls) {
      if (c.roomId == null) continue;
      if (!controlsByRoom.has(c.roomId)) controlsByRoom.set(c.roomId, []);
      controlsByRoom.get(c.roomId)!.push(c);
    }

    const errors: string[] = [];
    let turnsOn = 0;
    let turnsOff = 0;
    let skipped = 0;
    let synced = 0;

    for (const item of rawRooms) {
      const roomNo = (item.roomNumber ?? "").toString().trim().toLowerCase();
      if (!roomNo) { skipped++; continue; }
      const statusRaw = hmsProcessKey(item.status);

      let targetState: 1 | 0 | null = null;
      if (HMS_ON_STATUSES.has(statusRaw)) targetState = 1;
      else if (HMS_OFF_STATUSES.has(statusRaw)) targetState = 0;
      else { skipped++; continue; } // Unknown status — skip

      const roomId = roomByNo.get(roomNo);
      if (roomId == null) { skipped++; continue; } // Room not configured in PowerHub

      const controls = controlsByRoom.get(roomId) ?? [];
      if (controls.length === 0) { skipped++; continue; }

      synced++;
      try {
        // Resolve a process type from the HMS status name so the command log
        // and room-chart activity badge show the correct event (e.g. "Checkin").
        const processType = processTypeByName.get(statusRaw) ?? null;
        await enqueueControlChange(controls, targetState, {
          processType,
          source: "hms-sync",
          requestedBy: "HMS Sync",
          grcNo: item.grcNo ?? null,
          guestName: item.guestName ?? null,
          billNo: item.billNo ?? null,
        });
        if (targetState === 1) turnsOn++; else turnsOff++;
      } catch (err: any) {
        errors.push(`Room ${item.roomNumber}: ${err.message}`);
      }
    }

    res.status(202).json({ synced, turnsOn, turnsOff, skipped, errors });
  },
);

router.post("/bulk", requirePermission("rooms.manage"), async (req, res) => {
  const BulkBody = z.object({
    propertyId: z.number().int().positive(),
    rooms: z
      .array(
        z.object({
          roomNo: z.string().min(1),
          blockId: z.number().int().nullable().optional(),
          floorId: z.number().int().nullable().optional(),
          roomTypeId: z.number().int().nullable().optional(),
        }),
      )
      .min(1)
      .max(500),
  });
  const parsed = BulkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { propertyId, rooms } = parsed.data;
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Validate all FK references belong to this property
  const blockIds = [...new Set(rooms.map((r) => r.blockId).filter((id): id is number => id != null))];
  const floorIds = [...new Set(rooms.map((r) => r.floorId).filter((id): id is number => id != null))];
  const roomTypeIds = [...new Set(rooms.map((r) => r.roomTypeId).filter((id): id is number => id != null))];

  if (blockIds.length > 0) {
    const validBlocks = await db.select({ id: blocksTable.id }).from(blocksTable)
      .where(and(eq(blocksTable.propertyId, propertyId), inArray(blocksTable.id, blockIds)));
    const validSet = new Set(validBlocks.map((b) => b.id));
    if (blockIds.some((id) => !validSet.has(id))) {
      res.status(400).json({ error: "One or more blockIds do not belong to this property" });
      return;
    }
  }
  if (floorIds.length > 0) {
    const validFloors = await db.select({ id: floorsTable.id }).from(floorsTable)
      .where(and(eq(floorsTable.propertyId, propertyId), inArray(floorsTable.id, floorIds)));
    const validSet = new Set(validFloors.map((f) => f.id));
    if (floorIds.some((id) => !validSet.has(id))) {
      res.status(400).json({ error: "One or more floorIds do not belong to this property" });
      return;
    }
  }
  if (roomTypeIds.length > 0) {
    const validTypes = await db.select({ id: roomTypesTable.id }).from(roomTypesTable)
      .where(and(eq(roomTypesTable.propertyId, propertyId), inArray(roomTypesTable.id, roomTypeIds)));
    const validSet = new Set(validTypes.map((t) => t.id));
    if (roomTypeIds.some((id) => !validSet.has(id))) {
      res.status(400).json({ error: "One or more roomTypeIds do not belong to this property" });
      return;
    }
  }

  // Find already-existing roomNos for this property so we can skip them
  const existingRows = await db.select({ roomNo: roomsTable.roomNo }).from(roomsTable)
    .where(eq(roomsTable.propertyId, propertyId));
  const existingNos = new Set(existingRows.map((r) => r.roomNo));

  const toInsert = rooms.filter((r) => !existingNos.has(r.roomNo));
  if (toInsert.length > 0) {
    await db.insert(roomsTable).values(
      toInsert.map((r) => ({
        propertyId,
        roomNo: r.roomNo,
        blockId: r.blockId ?? null,
        floorId: r.floorId ?? null,
        roomTypeId: r.roomTypeId ?? null,
        active: true,
      })),
    );
  }

  res.json({ created: toInsert.length, skipped: rooms.length - toInsert.length });
});

router.post("/", requirePermission("rooms.manage"), async (req, res) => {
  const body = validateBody(CreateRoomBody, req, res);
  if (!body) return;
  if (!canAccessProperty(req.currentUser!, body.propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (await rejectForeignRefs(res, body.propertyId, body)) return;
  const inserted = await db
    .insert(roomsTable)
    .values({
      propertyId: body.propertyId,
      roomNo: body.roomNo,
      blockId: body.blockId ?? null,
      floorId: body.floorId ?? null,
      roomTypeId: body.roomTypeId ?? null,
      active: body.active ?? true,
    })
    .returning({ id: roomsTable.id });
  const rows = await withJoins().where(eq(roomsTable.id, inserted[0]!.id));
  res.status(201).json(rows[0]);
});

router.patch("/:id", requirePermission("rooms.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateRoomBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (await rejectForeignRefs(res, existing[0].propertyId, body)) return;
  await db
    .update(roomsTable)
    .set({
      ...(body.roomNo !== undefined ? { roomNo: body.roomNo } : {}),
      ...(body.blockId !== undefined ? { blockId: body.blockId } : {}),
      ...(body.floorId !== undefined ? { floorId: body.floorId } : {}),
      ...(body.roomTypeId !== undefined ? { roomTypeId: body.roomTypeId } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(roomsTable.id, id));
  const rows = await withJoins().where(eq(roomsTable.id, id));
  res.json(rows[0]);
});

router.delete("/:id", requirePermission("rooms.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(roomsTable).where(eq(roomsTable.id, id));
  res.status(204).end();
});

export default router;
