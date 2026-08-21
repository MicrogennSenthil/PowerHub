import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import { propertiesTable } from "./properties";
import { roomsTable } from "./rooms";
import { controlsTable } from "./controls";
import { processTypesTable } from "./processTypes";

// One row per continuous ON period of a control. Opened when a control is
// switched on, closed when it is switched off (manually, by checkout, or by
// the auto-cutoff engine). Drives the room-wise usage/consumption report.
export const powerSessionsTable = pgTable("power_sessions", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  roomId: integer("room_id").references(() => roomsTable.id, {
    onDelete: "set null",
  }),
  controlId: integer("control_id")
    .notNull()
    .references(() => controlsTable.id, { onDelete: "cascade" }),
  processTypeId: integer("process_type_id").references(
    () => processTypesTable.id,
    { onDelete: "set null" },
  ),
  grcNo: text("grc_no"),
  billNo: text("bill_no"),
  guestName: text("guest_name"),
  requestedBy: text("requested_by"),
  // Wattage snapshot at session start so later edits to the control don't
  // rewrite history. kWh = wattage * hours / 1000.
  wattage: integer("wattage"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  // When the auto-cutoff engine should force this session off (start + the
  // process type's cutoffMinutes, only when the process has isAuto=true).
  cutoffDueAt: timestamp("cutoff_due_at", { withTimezone: true }),
  // 'manual' | 'mhms' | 'auto-cutoff' | 'process-overridden'
  endReason: text("end_reason"),
}, (t) => [
  // At most ONE open session per control — backstops the race where two
  // concurrent ON commands both pass the "no open session" check.
  uniqueIndex("power_sessions_one_open_per_control")
    .on(t.controlId)
    .where(isNull(t.endedAt)),
]);

export type PowerSessionRow = typeof powerSessionsTable.$inferSelect;
