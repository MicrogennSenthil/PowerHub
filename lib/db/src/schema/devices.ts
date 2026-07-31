import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { floorsTable } from "./floors";

export const devicesTable = pgTable(
  "devices",
  {
    id: serial("id").primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => propertiesTable.id, { onDelete: "cascade" }),
    // Unique per property — the same numeric code (e.g. "000001") may be used
    // in different properties as long as those relay boxes are physically
    // distinct. The poll endpoint (/PowerDeviceApi/:code) is global, so when
    // multiple properties share a code the server uses a best-effort heuristic
    // (prefers the device with a pending command). Use a property-specific
    // prefix (hotel code + number, e.g. KDS001) to avoid any ambiguity.
    code: text("code").notNull(),
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
  },
  (t) => [
    // Code must be unique within a property. The same code may exist in
    // different properties (each maps to a physically distinct relay box).
    uniqueIndex("devices_property_code_unique").on(t.propertyId, t.code),
  ],
);

export type DeviceRow = typeof devicesTable.$inferSelect;
