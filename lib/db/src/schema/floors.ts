import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const floorsTable = pgTable("floors", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export type FloorRow = typeof floorsTable.$inferSelect;
