import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@workspace/db";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";

interface SimpleRow {
  id: number;
  propertyId: number;
  name: string;
  active: boolean;
}

const serialize = (r: SimpleRow) => ({
  id: r.id,
  propertyId: r.propertyId,
  name: r.name,
  active: r.active,
});

// Factory for property-scoped masters that share the exact same shape:
// blocks, floors, room types (id, propertyId, name, active).
export function makeSimpleMasterRouter(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  prefix: string;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
}): IRouter {
  const { table, prefix, createSchema, updateSchema } = opts;
  const router: IRouter = Router();

  router.get("/", requirePermission(`${prefix}.view`), async (req, res) => {
    const propertyId = parsePropertyIdQuery(req);
    if (propertyId === null) {
      res.status(400).json({ error: "propertyId query param is required" });
      return;
    }
    if (!canAccessProperty(req.currentUser!, propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = (await db
      .select()
      .from(table)
      .where(eq(table.propertyId, propertyId))) as SimpleRow[];
    res.json(rows.map(serialize));
  });

  router.post("/", requirePermission(`${prefix}.manage`), async (req, res) => {
    const body = validateBody(createSchema, req, res);
    if (!body) return;
    if (!canAccessProperty(req.currentUser!, body.propertyId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const inserted = (await db
      .insert(table)
      .values({
        propertyId: body.propertyId,
        name: body.name,
        active: body.active ?? true,
      })
      .returning()) as SimpleRow[];
    res.status(201).json(serialize(inserted[0]!));
  });

  router.patch(
    "/:id",
    requirePermission(`${prefix}.manage`),
    async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const body = validateBody(updateSchema, req, res);
      if (!body) return;
      const existing = (await db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1)) as SimpleRow[];
      const row = existing[0];
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!canAccessProperty(req.currentUser!, row.propertyId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.active !== undefined) patch.active = body.active;
      const updated = (await db
        .update(table)
        .set(patch)
        .where(eq(table.id, id))
        .returning()) as SimpleRow[];
      res.json(serialize(updated[0]!));
    },
  );

  router.delete(
    "/:id",
    requirePermission(`${prefix}.manage`),
    async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const existing = (await db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1)) as SimpleRow[];
      const row = existing[0];
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!canAccessProperty(req.currentUser!, row.propertyId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      await db.delete(table).where(eq(table.id, id));
      res.status(204).end();
    },
  );

  return router;
}
