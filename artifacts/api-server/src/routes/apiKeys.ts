import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, apiKeysTable, type ApiKeyRow } from "@workspace/db";
import { CreateApiKeyBody, UpdateApiKeyBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, parsePropertyIdQuery, validateBody } from "../lib/http";
import { generateApiKey } from "../lib/apiKeyAuth";

const router: IRouter = Router();

const serialize = (r: ApiKeyRow) => ({
  id: r.id,
  propertyId: r.propertyId,
  name: r.name,
  prefix: r.prefix,
  active: r.active,
  createdAt: r.createdAt.toISOString(),
  lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
});

router.get("/", requirePermission("integration.view"), async (req, res) => {
  const propertyId = parsePropertyIdQuery(req);
  if (propertyId === null) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.propertyId, propertyId));
  res.json(rows.map(serialize));
});

router.post("/", requirePermission("integration.manage"), async (req, res) => {
  const body = validateBody(CreateApiKeyBody, req, res);
  if (!body) return;
  if (!canAccessProperty(req.currentUser!, body.propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { key, hash, prefix } = generateApiKey();
  const inserted = await db
    .insert(apiKeysTable)
    .values({ propertyId: body.propertyId, name: body.name, keyHash: hash, prefix })
    .returning();
  res.status(201).json({ ...serialize(inserted[0]!), key });
});

router.patch("/:id", requirePermission("integration.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = validateBody(UpdateApiKeyBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const updated = await db
    .update(apiKeysTable)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(apiKeysTable.id, id))
    .returning();
  res.json(serialize(updated[0]!));
});

router.post("/:id/regenerate", requirePermission("integration.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { key, hash, prefix } = generateApiKey();
  const updated = await db
    .update(apiKeysTable)
    .set({ keyHash: hash, prefix })
    .where(eq(apiKeysTable.id, id))
    .returning();
  res.json({ ...serialize(updated[0]!), key });
});

router.delete("/:id", requirePermission("integration.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, existing[0].propertyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  res.status(204).end();
});

export default router;
