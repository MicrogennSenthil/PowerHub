import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  controlsTable,
  devicesTable,
  powerLogsTable,
  powerSessionsTable,
  type ControlRow,
  type ProcessTypeRow,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Power command queue. Mirrors the legacy firmware contract: any state change
// rebuilds the full per-slate on/off bitmask for the device and enqueues a
// PowerLog row (flag=0). The box polls, applies push/pull, then acks with the
// randomNo which flips flag to 1.
// ---------------------------------------------------------------------------

export interface CommandMeta {
  processType?: ProcessTypeRow | null;
  source: "mhms" | "ui" | "auto-cutoff";
  grcNo?: string | null;
  billNo?: string | null;
  guestName?: string | null;
  requestedBy?: string | null;
}

function slateMaskHex(controls: ControlRow[], slate: number): string {
  // Active-high bitmask: relay ON = bit 1. Channel 1 → bit 0 (LSB).
  // IMPORTANT: the relay board firmware parses the value with atoi() (decimal).
  // The *0X prefix is a protocol literal that the firmware strips before parsing.
  //   atoi("07") = 7  = 0b00000111 → Ch1+Ch2+Ch3  ✓
  //   atoi("0F") = 0  (stops at non-digit 'F')     → all OFF ✗ (confirmed bug)
  //   atoi("15") = 15 = 0b00001111 → Ch1+Ch2+Ch3+Ch4 ✓
  // Values 0–9 are identical in decimal and hex so *0X07 works either way.
  // Values ≥ 10 MUST be expressed in decimal (e.g. 15→"15", not "0F").
  let mask = 0;
  for (const c of controls) {
    if (c.slate === slate && c.state === 1) {
      mask |= 1 << (c.channel - 1);
    }
  }
  // Decimal string, minimum 2 chars (e.g. 7→"07", 15→"15", 31→"31").
  return mask.toString(10).padStart(2, "0");
}

export function buildPush(controls: ControlRow[]): string {
  return `*0X${slateMaskHex(controls, 1)}`;
}
export function buildPull(controls: ControlRow[]): string {
  return `$0X${slateMaskHex(controls, 2)}`;
}

/**
 * Set the given controls to `state` (1=on, 0=off), enqueue one PowerLog
 * command per affected device, and open/close usage sessions.
 * Runs in a single transaction. Returns the queued log ids.
 */
export async function enqueueControlChange(
  targetControls: ControlRow[],
  state: 0 | 1,
  meta: CommandMeta,
): Promise<number[]> {
  if (targetControls.length === 0) return [];
  const propertyId = targetControls[0]!.propertyId;
  const now = new Date();
  const logIds: number[] = [];

  await db.transaction(async (tx) => {
    const ids = targetControls.map((c) => c.id);

    // Only controls actually changing state get sessions opened/closed.
    const changing = targetControls.filter((c) => c.state !== state);

    await tx
      .update(controlsTable)
      .set({ state })
      .where(inArray(controlsTable.id, ids));

    // Rebuild full bitmasks per device (post-update view of ALL its controls).
    const deviceIds = [...new Set(targetControls.map((c) => c.deviceId))];
    for (const deviceId of deviceIds) {
      const deviceRows = await tx
        .select()
        .from(devicesTable)
        .where(eq(devicesTable.id, deviceId))
        .limit(1);
      const device = deviceRows[0];
      if (!device) continue;
      const allControls = await tx
        .select()
        .from(controlsTable)
        .where(eq(controlsTable.deviceId, deviceId));
      const first = targetControls.find((c) => c.deviceId === deviceId)!;
      // Each new command carries the COMPLETE relay bitmask for this device,
      // so any older pending command is now obsolete — applying it after the
      // new one would put relays into a stale intermediate state (e.g. rapid
      // ON clicks queue *0X01, *0X03, *0X07, *0X0F; box processes *0X01 last
      // and wipes the relays that were already ON).
      // Solution: supersede (flag=2) all still-pending commands for this
      // device before inserting the new authoritative one.
      await tx
        .update(powerLogsTable)
        .set({ flag: 2 })
        .where(
          and(eq(powerLogsTable.deviceId, deviceId), eq(powerLogsTable.flag, 0)),
        );

      // randomNo only needs to be 4-digit (legacy firmware contract).
      // No collision risk now since we just cleared all pending rows.
      const randomNo = 1000 + Math.floor(Math.random() * 9000);
      const inserted = await tx
        .insert(powerLogsTable)
        .values({
          propertyId,
          deviceId,
          deviceCode: device.code,
          roomId: first.roomId ?? null,
          controlId: targetControls.length === 1 ? first.id : null,
          processTypeId: meta.processType?.id ?? null,
          state,
          controlPush: buildPush(allControls),
          controlPull: buildPull(allControls),
          randomNo,
          flag: 0,
          source: meta.source,
          grcNo: meta.grcNo ?? null,
          billNo: meta.billNo ?? null,
          guestName: meta.guestName ?? null,
          requestedBy: meta.requestedBy ?? null,
        })
        .returning({ id: powerLogsTable.id });
      logIds.push(inserted[0]!.id);
    }

    if (state === 1) {
      // Open a session per control switching on (skip if one is already open).
      for (const c of changing) {
        const open = await tx
          .select({ id: powerSessionsTable.id })
          .from(powerSessionsTable)
          .where(
            and(
              eq(powerSessionsTable.controlId, c.id),
              isNull(powerSessionsTable.endedAt),
            ),
          )
          .limit(1);
        if (open[0]) continue;
        const pt = meta.processType;
        const cutoffDueAt =
          pt && pt.isAuto && pt.cutoffMinutes > 0
            ? new Date(now.getTime() + pt.cutoffMinutes * 60_000)
            : null;
        // Partial unique index (control_id WHERE ended_at IS NULL) backstops
        // the check above against concurrent ONs for the same control.
        await tx
          .insert(powerSessionsTable)
          .values({
          propertyId,
          roomId: c.roomId ?? null,
          controlId: c.id,
          processTypeId: pt?.id ?? null,
          grcNo: meta.grcNo ?? null,
          billNo: meta.billNo ?? null,
          guestName: meta.guestName ?? null,
          requestedBy: meta.requestedBy ?? null,
          wattage: c.wattage ?? null,
          startedAt: now,
          cutoffDueAt,
        })
          .onConflictDoNothing();
      }
    } else {
      // Close any open sessions for controls switching off.
      const changingIds = changing.map((c) => c.id);
      if (changingIds.length > 0) {
        await tx
          .update(powerSessionsTable)
          .set({
            endedAt: now,
            endReason:
              meta.source === "auto-cutoff" ? "auto-cutoff" : meta.source,
          })
          .where(
            and(
              inArray(powerSessionsTable.controlId, changingIds),
              isNull(powerSessionsTable.endedAt),
            ),
          );
      }
    }
  });

  return logIds;
}
