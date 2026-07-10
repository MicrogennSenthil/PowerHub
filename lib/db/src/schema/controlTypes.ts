import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const controlTypesTable = pgTable("control_types", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  powerRatingWatts: doublePrecision("power_rating_watts").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export type ControlTypeRow = typeof controlTypesTable.$inferSelect;
