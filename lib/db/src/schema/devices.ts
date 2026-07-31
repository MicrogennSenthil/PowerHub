import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { floorsTable } from "./floors";

export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  // Globally unique — the relay box identifies itself solely by this code
  // in the unauthenticated poll endpoint. Two boxes with the same code would
  // share the same command queue and cross-contaminate relay commands across
  // properties. Use hotelCode+number (e.g. KDS001) to stay unique globally.
  code: text("code").notNull().unique(),
  ipAddress: text("ip_address"),
  // IP the box last connected from, as reported by the companion bridge
  // (x-device-ip header). Updated on every poll.
  reportedIp: text("reported_ip"),
  // Previous reported IP — kept when the box shows up from a new address
  // (e.g. after a reset the router hands out a different DHCP lease).
  previousReportedIp: text("previous_reported_ip"),
  // ESP32 setup-mode (config hotspot) IP — noted manually by whoever
  // configures the chip; changes after firmware resets.
  setupIp: text("setup_ip"),
  description: text("description"),
  floorId: integer("floor_id").references(() => floorsTable.id, {
    onDelete: "set null",
  }),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DeviceRow = typeof devicesTable.$inferSelect;
