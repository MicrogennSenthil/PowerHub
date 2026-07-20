import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

// Machine credentials for external systems (MHMS front-office) calling the
// Power Automation REST API. Only a SHA-256 hash of the key is stored; the
// plaintext key is shown exactly once at creation time.
export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  // First characters of the key, for display ("phk_ab12…")
  prefix: text("prefix").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type ApiKeyRow = typeof apiKeysTable.$inferSelect;
