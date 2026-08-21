import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  controlsTable,
  devicesTable,
  powerLogsTable,
  powerSessionsTable,
  type ControlRow,
  type ProcessTypeRow,
} from "@workspace/db";
import { shouldReplaceOpenSession } from "./sessionTransition";

// ---------------------------------------------------------------------------
// Power command queue. Mirrors the legacy firmware contract: any state change
// rebuilds the full per-slate on/off bitmask for the device and enqueues a
// PowerLog row (flag=0). The box polls, applies push/pull, then acks with the
// randomNo which flips flag to 1.
// ---------------------------------------------------------------------------

export interface CommandMeta {
  processType?: ProcessTypeRow | null;
  // Raw process/event name from an integration. This lets a real process
  // transition supersede a timed session even when its Process Master row is
  // missing (for example, MHMS sends "Walkin" but only "Checkin" is configured).
  processEvent?: string | null;
  source: "mhms" | "ui" | "auto-cutoff" | "hms-sync";
  // Auto-cutoff safety guard: only switch the control off if this exact
  // session is still the current open session after the control row is locked.
  expectedSessionId?: number;
  grcNo?: string | null;
  billNo?: string | null;
  guestName?: string | null;
  requestedBy?: string | null;
}

function slateMaskHex(controls: ControlRow[], slate: number): string {
  // NC (Normally Closed) relay wiring — bit semantics are INVERTED vs active-high:
  //   bit = 0 → relay de-energised → NC contacts CLOSED → room power ON  ✓
  //   bit = 1 → relay energised    → NC contacts OPEN   → room power OFF ✓
  //
  // Therefore we set bits for channels that are OFF (state=0), not ON.
  // A channel with state=1 (ON) keeps its bit at 0, leaving the NC contact
  // closed so current flows to the room.
  //
  // IMPORTANT: the relay board firmware parses the value as HEXADECIMAL but
  // only handles lowercase hex letters (a-f). Uppercase A-F stops the parser
  // early (returns 0) → all relays de-energised → all NC closed → all ON.
  //   "07" → 0x07 = 7  → Ch1+Ch2+Ch3 relays energised (those rooms OFF)  ✓
  //   "0F" → firmware stops at 'F' → 0 → all de-energised → all ON       ✗
  //   "0f" → 0x0f = 15 → Ch1–Ch4 energised (those rooms OFF)             ✓
  let mask = 0;
  for (const c of controls) {
    if (c.slate === slate && c.state === 0) {
      mask |= 1 << (c.channel - 1);
    }
  }
  // Lowercase hex, minimum 2 chars (e.g. 7→"07", 15→"0f", 31→"1f").
  return mask.toString(16).toLowerCase().padStart(2, "0");
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

    // Serialize all state/session transitions for these controls. In
    // particular this prevents a due Visiting cutoff from racing a Walk-in:
    // whichever obtains the control lock first completes, and the later
    // auto-cutoff can verify that its original session is still current.
    const lockedControls = await tx
      .select()
      .from(controlsTable)
      .where(inArray(controlsTable.id, ids))
      .for("update");
    const lockedById = new Map(lockedControls.map((c) => [c.id, c]));
    const currentTargets = targetControls
      .map((c) => lockedById.get(c.id))
      .filter((c): c is ControlRow => c != null);
    if (currentTargets.length === 0) return;

    if (meta.expectedSessionId != null) {
      const expectedOpen = await tx
        .select({ id: powerSessionsTable.id })
        .from(powerSessionsTable)
        .where(
          and(
            eq(powerSessionsTable.id, meta.expectedSessionId),
            inArray(powerSessionsTable.controlId, ids),
            isNull(powerSessionsTable.endedAt),
          ),
        )
        .limit(1);
      // A newer process (such as Walk-in/Checkin) already replaced the timed
      // session. Its old timer is obsolete and must not cut room power.
      if (!expectedOpen[0]) return;
    }

    // Only controls actually changing state get OFF sessions closed.
    const changing = currentTargets.filter((c) => c.state !== state);

    await tx
      .update(controlsTable)
      .set({ state })
      .where(inArray(controlsTable.id, ids));

    // Rebuild full bitmasks per device (post-update view of ALL its controls).
    const deviceIds = [...new Set(currentTargets.map((c) => c.deviceId))];
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
      const first = currentTargets.find((c) => c.deviceId === deviceId)!;
      // Each new command carries the COMPLETE relay bitmask for this device,
      // so any older pending command for the SAME ROOM is now obsolete —
      // applying it after the new one would put relays into a stale
      // intermediate state (e.g. rapid ON clicks queue *0X01, *0X03, *0X07,
      // *0X0F; box processes *0X01 last and wipes the relays already ON).
      //
      // IMPORTANT: only supersede commands that target the same room.
      // If room 103 is checking OUT and room 105 is checking IN at the same
      // time, both on device 000001, the 105-ON command must NOT swallow the
      // 103-OFF command.  The box will deliver them in queue order:
      //   1. 103 OFF (*0X00) — relay physically de-energises              ✓
      //   2. 105 ON  (*0X14) — relay energises for 105's channels         ✓
      // Without this guard the 103-OFF is superseded, the board only
      // receives *0X14 (SET 105), and the 103 relay stays energised.
      //
      // Rule: supersede only when the pending command has the SAME roomId as
      // the new one (or when either side has no roomId — fall back to the
      // original full-device supersession for non-room commands).
      const newRoomId = first.roomId ?? null;
      await tx
        .update(powerLogsTable)
        .set({ flag: 2 })
        .where(
          and(
            eq(powerLogsTable.deviceId, deviceId),
            eq(powerLogsTable.flag, 0),
            // When both sides have a known room, only supersede same-room rows.
            // If either is null we can't safely scope it, so fall back to
            // the old full-device behaviour.
            newRoomId != null
              ? or(isNull(powerLogsTable.roomId), eq(powerLogsTable.roomId, newRoomId))
              : undefined,
          ),
        );

      // randomNo must be 4-digit (legacy firmware contract: #RRRR in the
      // command string). With room-level supersession, multiple rooms on the
      // same device can have concurrent pending rows, so we must avoid
      // collisions — an ack matches by (deviceId, randomNo, flag=0), so two
      // pending rows sharing a randomNo would both get acked when the box
      // acks only the first one, silently dropping the second command.
      const usedNos = await tx
        .select({ randomNo: powerLogsTable.randomNo })
        .from(powerLogsTable)
        .where(and(eq(powerLogsTable.deviceId, deviceId), eq(powerLogsTable.flag, 0)));
      const usedSet = new Set(usedNos.map((r) => r.randomNo));
      let randomNo = 1000 + Math.floor(Math.random() * 9000);
      // 9000 possible values; at most a handful of concurrent pending rows →
      // expected iterations ≈ 1; hard-cap at 50 to avoid infinite loops.
      for (let i = 0; usedSet.has(randomNo) && i < 50; i++) {
        randomNo = 1000 + Math.floor(Math.random() * 9000);
      }
      const inserted = await tx
        .insert(powerLogsTable)
        .values({
          propertyId,
          deviceId,
          deviceCode: device.code,
          roomId: first.roomId ?? null,
          controlId: currentTargets.length === 1 ? first.id : null,
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
      // A process can change while the relay is already ON. For example, a
      // Visiting session (with a 10-minute cutoff) becomes Walk-in/Checkin
      // before the timer expires. This must replace the session — simply
      // skipping it because the control state is already ON leaves the old
      // cutoff alive and will unexpectedly cut a checked-in guest's power.
      //
      // Repeated commands for the SAME process intentionally keep their
      // session. Only a genuine process transition closes the old session and
      // starts a new one with the incoming process' timer rules.
      for (const c of currentTargets) {
        const open = await tx
          .select({
            id: powerSessionsTable.id,
            processTypeId: powerSessionsTable.processTypeId,
          })
          .from(powerSessionsTable)
          .where(
            and(
              eq(powerSessionsTable.controlId, c.id),
              isNull(powerSessionsTable.endedAt),
            ),
          )
          .limit(1);
        const existing = open[0];
        const incomingProcessTypeId = meta.processType?.id ?? null;
        const hasIncomingProcess =
          incomingProcessTypeId != null ||
          Boolean(meta.processEvent?.trim());
        const isProcessChange =
          existing != null &&
          shouldReplaceOpenSession(
            existing.processTypeId,
            incomingProcessTypeId,
            hasIncomingProcess,
          );

        if (existing && !isProcessChange) continue;

        if (existing) {
          await tx
            .update(powerSessionsTable)
            .set({ endedAt: now, endReason: "process-overridden" })
            .where(eq(powerSessionsTable.id, existing.id));
        }

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
