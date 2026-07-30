import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { devicesTable } from "./devices";
import { roomsTable } from "./rooms";
import { controlTypesTable } from "./controlTypes";

// One row per physical relay channel. A device (relay box) has 16 channels:
// 8 on slate 1 and 8 on slate 2.
export const controlsTable = pgTable("controls", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  slate: integer("slate").notNull(),
  channel: integer("channel").notNull(),
  label: text("label"),
  roomId: integer("room_id").references(() => roomsTable.id, {
    onDelete: "set null",
  }),
  controlTypeId: integer("control_type_id").references(
    () => controlTypesTable.id,
    { onDelete: "set null" },
  ),
  state: integer("state").notNull().default(0),
  // Rated load in watts; used to compute consumption (kWh) in usage reports.
  wattage: integer("wattage"),
  // Object-storage path for a photo of this channel's physical load
  // (e.g. a picture of the light fixture or AC unit).  Stored as the
  // normalised objectPath returned by the upload endpoint (/objects/…).
  photoUrl: text("photo_url"),
});

export type ControlRow = typeof controlsTable.$inferSelect;
