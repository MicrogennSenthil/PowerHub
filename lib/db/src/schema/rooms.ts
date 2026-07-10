import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { blocksTable } from "./blocks";
import { floorsTable } from "./floors";
import { roomTypesTable } from "./roomTypes";

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  roomNo: text("room_no").notNull(),
  blockId: integer("block_id").references(() => blocksTable.id, {
    onDelete: "set null",
  }),
  floorId: integer("floor_id").references(() => floorsTable.id, {
    onDelete: "set null",
  }),
  roomTypeId: integer("room_type_id").references(() => roomTypesTable.id, {
    onDelete: "set null",
  }),
  active: boolean("active").notNull().default(true),
});

export type RoomRow = typeof roomsTable.$inferSelect;
