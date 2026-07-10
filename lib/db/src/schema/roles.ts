import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
});

export type RoleRow = typeof rolesTable.$inferSelect;
