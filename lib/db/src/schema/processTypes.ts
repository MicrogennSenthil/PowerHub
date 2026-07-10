import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const processTypesTable = pgTable("process_types", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  cutoffMinutes: integer("cutoff_minutes").notNull().default(0),
  isAuto: boolean("is_auto").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export type ProcessTypeRow = typeof processTypesTable.$inferSelect;
