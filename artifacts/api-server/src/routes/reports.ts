import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import {
  db,
  powerSessionsTable,
  roomsTable,
  blocksTable,
  controlsTable,
  controlTypesTable,
  processTypesTable,
  propertiesTable,
} from "@workspace/db";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parsePropertyIdQuery } from "../lib/http";

const router: IRouter = Router();

router.get("/power-usage", requirePermission("reports.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const q = (k: string): string | undefined => {
    const v = req.query[k];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const from = q("from") ? new Date(q("from")!) : undefined;
  const to = q("to") ? new Date(q("to")!) : undefined;
  const roomId = q("roomId") ? Number(q("roomId")) : undefined;

  const conditions = [eq(powerSessionsTable.propertyId, propertyId)];
  // Overlap with [from, to]: startedAt <= to AND (endedAt >= from OR open)
  if (to) conditions.push(lte(powerSessionsTable.startedAt, to));
  if (from) {
    conditions.push(
      or(
        gte(powerSessionsTable.endedAt, from),
        isNull(powerSessionsTable.endedAt),
      )!,
    );
  }
  if (roomId && Number.isInteger(roomId)) {
    conditions.push(eq(powerSessionsTable.roomId, roomId));
  }
  if (q("guest")) {
    conditions.push(ilike(powerSessionsTable.guestName, `%${q("guest")}%`));
  }
  if (q("billNo")) conditions.push(eq(powerSessionsTable.billNo, q("billNo")!));
  if (q("grcNo")) conditions.push(eq(powerSessionsTable.grcNo, q("grcNo")!));
  if (q("username")) {
    conditions.push(ilike(powerSessionsTable.requestedBy, `%${q("username")}%`));
  }
  // source filter: "hms-sync" → requestedBy = "HMS Sync"; "ui" → not HMS Sync/mhms
  if (q("source")) {
    const src = q("source")!;
    if (src === "hms-sync") {
      conditions.push(ilike(powerSessionsTable.requestedBy, "%HMS Sync%"));
    } else if (src === "mhms") {
      conditions.push(ilike(powerSessionsTable.requestedBy, "%mhms%"));
    }
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, propertyId))
    .limit(1);

  const rows = await db
    .select({
      s: powerSessionsTable,
      roomNo: roomsTable.roomNo,
      blockName: blocksTable.name,
      controlLabel: controlsTable.label,
      controlTypeName: controlTypesTable.name,
      processName: processTypesTable.name,
    })
    .from(powerSessionsTable)
    .leftJoin(roomsTable, eq(powerSessionsTable.roomId, roomsTable.id))
    .leftJoin(blocksTable, eq(roomsTable.blockId, blocksTable.id))
    .leftJoin(controlsTable, eq(powerSessionsTable.controlId, controlsTable.id))
    .leftJoin(
      controlTypesTable,
      eq(controlsTable.controlTypeId, controlTypesTable.id),
    )
    .leftJoin(
      processTypesTable,
      eq(powerSessionsTable.processTypeId, processTypesTable.id),
    )
    .where(and(...conditions))
    .orderBy(desc(powerSessionsTable.startedAt))
    .limit(2000);

  const tariff = property?.tariffPerKwh ?? 0;
  const now = new Date();
  const sessions = rows.map(
    ({ s, roomNo, blockName, controlLabel, controlTypeName, processName }) => {
      const end = s.endedAt ?? now;
      const hours =
        Math.max(0, end.getTime() - s.startedAt.getTime()) / 3_600_000;
      const kwh = s.wattage ? (s.wattage * hours) / 1000 : 0;
      const round = (n: number) => Math.round(n * 100) / 100;
      return {
        id: s.id,
        roomId: s.roomId,
        roomNo,
        blockName,
        controlId: s.controlId,
        controlLabel,
        controlTypeName,
        processName,
        grcNo: s.grcNo,
        billNo: s.billNo,
        guestName: s.guestName,
        requestedBy: s.requestedBy,
        wattage: s.wattage,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        endReason: s.endReason,
        hours: round(hours),
        kwh: round(kwh),
        cost: round(kwh * tariff),
      };
    },
  );

  const round = (n: number) => Math.round(n * 100) / 100;
  res.json({
    sessions,
    totals: {
      sessions: sessions.length,
      hours: round(sessions.reduce((a, s) => a + s.hours, 0)),
      kwh: round(sessions.reduce((a, s) => a + s.kwh, 0)),
      cost: round(sessions.reduce((a, s) => a + s.cost, 0)),
    },
    tariffPerKwh: tariff,
    currency: property?.currency ?? "INR",
  });
});

export default router;
