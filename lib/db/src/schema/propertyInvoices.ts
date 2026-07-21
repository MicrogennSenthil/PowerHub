import {
  pgTable,
  serial,
  integer,
  text,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const propertyInvoicesTable = pgTable("property_invoices", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull().default("INR"),
  description: text("description"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PropertyInvoiceRow = typeof propertyInvoicesTable.$inferSelect;
