import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  powerLogsTable,
  roomsTable,
  controlsTable,
  processTypesTable,
} from "@workspace/db";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parsePropertyIdQuery } from "../lib/http";

const router: IRouter = Router();

router.get("/", requirePermission("integration.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const flagRaw = req.query["flag"];
  const flag =
    typeof flagRaw === "string" && flagRaw !== "" ? Number(flagRaw) : null;
  const limitRaw = req.query["limit"];
  const limit = Math.min(
    typeof limitRaw === "string" ? Number(limitRaw) || 100 : 100,
    500,
  );

  const conditions = [eq(powerLogsTable.propertyId, propertyId)];
  if (flag !== null && Number.isInteger(flag)) {
    conditions.push(eq(powerLogsTable.flag, flag));
  }

  const rows = await db
    .select({
      log: powerLogsTable,
      roomNo: roomsTable.roomNo,
      controlLabel: controlsTable.label,
      processName: processTypesTable.name,
    })
    .from(powerLogsTable)
    .leftJoin(roomsTable, eq(powerLogsTable.roomId, roomsTable.id))
    .leftJoin(controlsTable, eq(powerLogsTable.controlId, controlsTable.id))
    .leftJoin(
      processTypesTable,
      eq(powerLogsTable.processTypeId, processTypesTable.id),
    )
    .where(and(...conditions))
    .orderBy(desc(powerLogsTable.id))
    .limit(limit);

  res.json(
    rows.map(({ log, roomNo, controlLabel, processName }) => ({
      id: log.id,
      propertyId: log.propertyId,
      deviceId: log.deviceId,
      deviceCode: log.deviceCode,
      roomId: log.roomId,
      roomNo,
      controlId: log.controlId,
      controlLabel,
      processTypeId: log.processTypeId,
      processName,
      state: log.state,
      controlPush: log.controlPush,
      controlPull: log.controlPull,
      flag: log.flag,
      source: log.source,
      grcNo: log.grcNo,
      billNo: log.billNo,
      guestName: log.guestName,
      requestedBy: log.requestedBy,
      rdate: log.rdate.toISOString(),
      receivedAt: log.receivedAt ? log.receivedAt.toISOString() : null,
      closedAt: log.closedAt ? log.closedAt.toISOString() : null,
    })),
  );
});

export default router;
