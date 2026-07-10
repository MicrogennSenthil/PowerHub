import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  doublePrecision,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const propertiesTable = pgTable(
  "properties",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address"),
    city: text("city"),
    pincode: text("pincode"),
    email: text("email"),
    phone: text("phone"),
    currency: text("currency").notNull().default("INR"),
    tariffPerKwh: doublePrecision("tariff_per_kwh").notNull().default(0),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // Case-insensitive uniqueness so "ABC" and "abc" can't both exist. This is
    // the authoritative guarantee; the app-level checks are just for nicer errors.
    codeLowerUnique: uniqueIndex("properties_code_lower_unique").on(
      sql`lower(${t.code})`,
    ),
  }),
);

export type PropertyRow = typeof propertiesTable.$inferSelect;
