import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { devicesTable } from "./devices";
import { roomsTable } from "./rooms";
import { controlsTable } from "./controls";
import { processTypesTable } from "./processTypes";

// Command queue + audit trail for relay boxes (rebuild of legacy `PowerLog`).
// A row with flag=0 is a pending command; the box polls, applies the per-slate
// push/pull hex bitmasks, then acks with randomNo which flips flag to 1.
export const powerLogsTable = pgTable("power_logs", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  deviceCode: text("device_code").notNull(),
  roomId: integer("room_id").references(() => roomsTable.id, {
    onDelete: "set null",
  }),
  controlId: integer("control_id").references(() => controlsTable.id, {
    onDelete: "set null",
  }),
  processTypeId: integer("process_type_id").references(
    () => processTypesTable.id,
    { onDelete: "set null" },
  ),
  // 1 = turn on, 0 = turn off (the requested state for the targeted controls)
  state: integer("state").notNull(),
  // Full per-slate bitmask commands, hex-encoded like the legacy firmware
  // expects: push = slate 1 mask ("*0X.."), pull = slate 2 mask ("$0X..").
  controlPush: text("control_push").notNull(),
  controlPull: text("control_pull").notNull(),
  // Ack token the box echoes back to confirm it applied the command.
  randomNo: integer("random_no").notNull(),
  // 0 = pending, 1 = delivered+acked
  flag: integer("flag").notNull().default(0),
  // Where the command came from: 'mhms' | 'ui' | 'auto-cutoff'
  source: text("source").notNull().default("ui"),
  grcNo: text("grc_no"),
  billNo: text("bill_no"),
  guestName: text("guest_name"),
  requestedBy: text("requested_by"),
  rdate: timestamp("rdate", { withTimezone: true }).notNull().defaultNow(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export type PowerLogRow = typeof powerLogsTable.$inferSelect;
