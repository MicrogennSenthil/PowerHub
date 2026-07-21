import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  // Property-scoped: each property owns its own role list.
  // NULL is allowed only for legacy global system roles being phased out.
  propertyId: integer("property_id").references(() => propertiesTable.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
});

export type RoleRow = typeof rolesTable.$inferSelect;
