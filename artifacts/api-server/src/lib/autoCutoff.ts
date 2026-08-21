import { and, eq, isNull, lte, inArray, sql } from "drizzle-orm";
import {
  db,
  controlsTable,
  powerSessionsTable,
  processTypesTable,
  roomsTable,
  propertiesTable,
} from "@workspace/db";
import { enqueueControlChange } from "./powerQueue";
import { notifyMhms } from "./mhmsNotify";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Auto-cutoff engine. The legacy system stored Ptime/IsAuto in the process
// master but nothing ever enforced it (missing SQL Agent job). Here a simple
// in-process sweep runs every 30s: any open session past its cutoffDueAt gets
// its control switched off via the normal command queue, so the relay box
// picks it up on its next poll and the session is closed with reason
// "auto-cutoff".
// ---------------------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;

export async function sweepAutoCutoff(): Promise<number> {
  const now = new Date();

  // Diagnostic: count sessions that are open but have no cutoffDueAt set.
  // This happens when the MHMS event name didn't match any process type
  // (e.g. case mismatch: MHMS sent "visiting", DB has "Visiting").
  // We log this periodically (odd 30-s ticks) so it shows up in PM2 logs
  // without flooding them.
  if (now.getSeconds() < 30) {
    const noTimer = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(powerSessionsTable)
      .where(
        and(
          isNull(powerSessionsTable.endedAt),
          isNull(powerSessionsTable.cutoffDueAt),
        ),
      );
    const n = noTimer[0]?.count ?? 0;
    if (n > 0) {
      logger.warn(
        { openSessionsWithNoTimer: n },
        "auto-cutoff: %d open session(s) have no cutoffDueAt — they will never be auto-cut. " +
        "This usually means the MHMS event name did not match any process type with isAuto=true. " +
        "Go to Masters → Process Types and make sure the Name matches exactly what MHMS sends " +
        "(e.g. 'Visiting'), isAuto is on, and cutoffMinutes > 0.",
        n,
      );
    }
  }

  const due = await db
    .select({
      sessionId: powerSessionsTable.id,
      controlId: powerSessionsTable.controlId,
      processTypeId: powerSessionsTable.processTypeId,
      grcNo: powerSessionsTable.grcNo,
      guestName: powerSessionsTable.guestName,
    })
    .from(powerSessionsTable)
    .where(
      and(
        isNull(powerSessionsTable.endedAt),
        lte(powerSessionsTable.cutoffDueAt, now),
      ),
    );
  if (due.length === 0) return 0;

  const controlIds = [...new Set(due.map((d) => d.controlId))];
  const controls = await db
    .select()
    .from(controlsTable)
    .where(inArray(controlsTable.id, controlIds));

  // Fetch rooms + MHMS property config for all affected controls in one query
  const roomIds = [...new Set(controls.map((c) => c.roomId).filter((id): id is number => id != null))];
  const roomRows = roomIds.length > 0
    ? await db
        .select({
          id: roomsTable.id,
          roomNo: roomsTable.roomNo,
          propertyId: roomsTable.propertyId,
          mhmsApiUrl: propertiesTable.mhmsApiUrl,
          mhmsApiKey: propertiesTable.mhmsApiKey,
        })
        .from(roomsTable)
        .leftJoin(propertiesTable, eq(roomsTable.propertyId, propertiesTable.id))
        .where(inArray(roomsTable.id, roomIds))
    : [];
  const roomById = new Map(roomRows.map((r) => [r.id, r]));
  let switchedOff = 0;

  // Group by property so each enqueue stays tenant-scoped; per control we use
  // its own session's process type for the audit row.
  for (const d of due) {
    const control = controls.find((c) => c.id === d.controlId);
    if (!control || control.state === 0) {
      // Control already off — just close the stale session.
      await db
        .update(powerSessionsTable)
        .set({ endedAt: now, endReason: "auto-cutoff" })
        .where(eq(powerSessionsTable.id, d.sessionId));
      continue;
    }
    const pt = d.processTypeId
      ? (
          await db
            .select()
            .from(processTypesTable)
            .where(eq(processTypesTable.id, d.processTypeId))
            .limit(1)
        )[0]
      : undefined;
    const queuedLogIds = await enqueueControlChange([control], 0, {
      processType: pt ?? null,
      source: "auto-cutoff",
      expectedSessionId: d.sessionId,
      grcNo: d.grcNo ?? null,
      billNo: null,
      guestName: d.guestName ?? null,
      requestedBy: null,
    });
    // The session may have been superseded by a Walk-in/Checkin after this
    // sweep took its initial snapshot. enqueueControlChange rechecks it under
    // the control lock; no queued command means the cutoff is obsolete.
    if (queuedLogIds.length === 0) continue;
    switchedOff += 1;

    // Notify MHMS so their room chart updates icon/colour immediately
    const room = control.roomId != null ? roomById.get(control.roomId) : undefined;
    if (room?.mhmsApiUrl && room.mhmsApiKey) {
      // Fire-and-forget — don't await so sweep stays fast
      notifyMhms(room.mhmsApiUrl, room.mhmsApiKey, {
        roomNumber: room.roomNo,
        action: "OFF",
        event: "auto-cutoff",
        grcNo: d.grcNo ?? null,
        guestName: d.guestName ?? null,
        timestamp: now.toISOString(),
      }).catch(() => {/* already logged inside notifyMhms */});
    }
  }
  logger.info({ count: switchedOff }, "Auto-cutoff sweep switched off sessions");
  return switchedOff;
}

export function startAutoCutoffEngine(): void {
  if (timer) return;
  timer = setInterval(() => {
    sweepAutoCutoff().catch((err) =>
      logger.error({ err }, "Auto-cutoff sweep failed"),
    );
  }, 30_000);
  timer.unref();
}
