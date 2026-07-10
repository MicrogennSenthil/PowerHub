import {
  pgTable,
  serial,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUsersTable } from "./appUsers";
import { propertiesTable } from "./properties";

// Which properties each user is allocated to (multi-tenant access control).
export const userPropertiesTable = pgTable(
  "user_properties",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => propertiesTable.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("user_property_unique").on(t.userId, t.propertyId)],
);

export type UserPropertyRow = typeof userPropertiesTable.$inferSelect;
