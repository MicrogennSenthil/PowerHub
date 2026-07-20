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
  // Globally unique — unauthenticated relay boxes identify themselves solely
  // by this code, so a collision across properties would break isolation.
  code: text("code").notNull().unique(),
  ipAddress: text("ip_address"),
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
