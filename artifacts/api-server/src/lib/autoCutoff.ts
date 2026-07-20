import { and, eq, isNull, lte, inArray } from "drizzle-orm";
import {
  db,
  controlsTable,
  powerSessionsTable,
  processTypesTable,
} from "@workspace/db";
import { enqueueControlChange } from "./powerQueue";
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
  const due = await db
    .select({
      sessionId: powerSessionsTable.id,
      controlId: powerSessionsTable.controlId,
      processTypeId: powerSessionsTable.processTypeId,
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
    await enqueueControlChange([control], 0, {
      processType: pt ?? null,
      source: "auto-cutoff",
    });
  }
  logger.info({ count: due.length }, "Auto-cutoff sweep switched off sessions");
  return due.length;
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
