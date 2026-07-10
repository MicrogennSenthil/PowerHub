import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { rolesTable } from "./roles";

export const appUsersTable = pgTable("app_users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id"),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  active: boolean("active").notNull().default(true),
  roleId: integer("role_id").references(() => rolesTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppUserRow = typeof appUsersTable.$inferSelect;
