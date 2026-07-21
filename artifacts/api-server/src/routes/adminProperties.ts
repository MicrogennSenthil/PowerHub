/**
 * Super-admin-only management panel for all properties (tenants).
 * Handles billing plan management and invoice history.
 * Mounted at /admin/properties.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  propertiesTable,
  appUsersTable,
  devicesTable,
  userPropertiesTable,
  propertyInvoicesTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { parseId, validateBody } from "../lib/http";
import { serializeProperty } from "../lib/serialize";
import { z } from "zod";

const router: IRouter = Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser?.isSuperAdmin) {
    res.status(403).json({ error: "Super admin access required." });
    return;
  }
  next();
}

router.use(requireAuth, requireSuperAdmin);

// ── GET /admin/properties ────────────────────────────────────────────────────
// All properties with live usage counts.
router.get("/", async (_req, res) => {
  const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.id);

  // User count per property (via user_properties join table)
  const userCounts = await db
    .select({
      propertyId: userPropertiesTable.propertyId,
      count: sql<number>`count(*)::int`,
    })
    .from(userPropertiesTable)
    .groupBy(userPropertiesTable.propertyId);
  const userCountMap = new Map(userCounts.map((r) => [r.propertyId, r.count]));

  // Device count per property
  const deviceCounts = await db
    .select({
      propertyId: devicesTable.propertyId,
      count: sql<number>`count(*)::int`,
    })
    .from(devicesTable)
    .groupBy(devicesTable.propertyId);
  const deviceCountMap = new Map(deviceCounts.map((r) => [r.propertyId, r.count]));

  res.json(
    properties.map((p) => ({
      ...serializeProperty(p),
      userCount: userCountMap.get(p.id) ?? 0,
      deviceCount: deviceCountMap.get(p.id) ?? 0,
    })),
  );
});

// ── PATCH /admin/properties/:id ──────────────────────────────────────────────
// Update billing/plan fields.
const AdminPropertyUpdateBody = z.object({
  planTier: z.enum(["trial", "starter", "pro"]).optional(),
  billingStatus: z.enum(["trial", "active", "suspended"]).optional(),
  maxUsers: z.number().int().min(1).optional(),
  maxDevices: z.number().int().min(1).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  nextBillingAt: z.string().datetime().nullable().optional(),
  // Allow updating basic property fields too
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = validateBody(AdminPropertyUpdateBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }

  const patch: Record<string, unknown> = {};
  if (body.planTier !== undefined) patch.planTier = body.planTier;
  if (body.billingStatus !== undefined) patch.billingStatus = body.billingStatus;
  if (body.maxUsers !== undefined) patch.maxUsers = body.maxUsers;
  if (body.maxDevices !== undefined) patch.maxDevices = body.maxDevices;
  if (body.trialEndsAt !== undefined) patch.trialEndsAt = body.trialEndsAt ? new Date(body.trialEndsAt) : null;
  if (body.nextBillingAt !== undefined) patch.nextBillingAt = body.nextBillingAt ? new Date(body.nextBillingAt) : null;
  if (body.name !== undefined) patch.name = body.name;
  if (body.active !== undefined) patch.active = body.active;

  const updated = await db
    .update(propertiesTable)
    .set(patch)
    .where(eq(propertiesTable.id, id))
    .returning();

  // Recalculate usage for response
  const [userCountRow, deviceCountRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userPropertiesTable)
      .where(eq(userPropertiesTable.propertyId, id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(devicesTable)
      .where(eq(devicesTable.propertyId, id)),
  ]);

  res.json({
    ...serializeProperty(updated[0]!),
    userCount: userCountRow[0]?.count ?? 0,
    deviceCount: deviceCountRow[0]?.count ?? 0,
  });
});

// ── GET /admin/properties/:id/invoices ───────────────────────────────────────
router.get("/:id/invoices", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select()
    .from(propertyInvoicesTable)
    .where(eq(propertyInvoicesTable.propertyId, id))
    .orderBy(sql`${propertyInvoicesTable.createdAt} desc`);
  res.json(rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    amount: r.amount,
    currency: r.currency,
    description: r.description,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// ── POST /admin/properties/:id/invoices ──────────────────────────────────────
const InvoiceInput = z.object({
  amount: z.number().positive(),
  currency: z.string().default("INR"),
  description: z.string().optional(),
  paidAt: z.string().datetime().nullable().optional(),
});

router.post("/:id/invoices", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = validateBody(InvoiceInput, req, res);
  if (!body) return;
  const prop = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!prop[0]) { res.status(404).json({ error: "Property not found" }); return; }

  const inserted = await db
    .insert(propertyInvoicesTable)
    .values({
      propertyId: id,
      amount: body.amount,
      currency: body.currency ?? "INR",
      description: body.description,
      paidAt: body.paidAt ? new Date(body.paidAt) : null,
    })
    .returning();
  const r = inserted[0]!;
  res.status(201).json({
    id: r.id,
    propertyId: r.propertyId,
    amount: r.amount,
    currency: r.currency,
    description: r.description,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  });
});

export default router;
