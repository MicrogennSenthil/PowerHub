import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
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
    // SaaS billing / subscription tracking (managed by super admin)
    planTier: text("plan_tier").notNull().default("trial"), // trial | starter | pro
    billingStatus: text("billing_status").notNull().default("trial"), // trial | active | suspended
    maxUsers: integer("max_users").notNull().default(10),
    maxDevices: integer("max_devices").notNull().default(5),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    nextBillingAt: timestamp("next_billing_at", { withTimezone: true }),
    // MHMS front-office connection — used to fetch room list for import
    mhmsApiUrl: text("mhms_api_url"),
    mhmsApiKey: text("mhms_api_key"),
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

// Plan tier values
export type PlanTier = "trial" | "starter" | "pro";
export type BillingStatus = "trial" | "active" | "suspended";
