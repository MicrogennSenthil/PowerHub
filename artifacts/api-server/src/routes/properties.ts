import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { CreatePropertyBody, UpdatePropertyBody } from "@workspace/api-zod";
import { requirePermission, canAccessProperty } from "../lib/auth";
import { parseId, validateBody } from "../lib/http";
import { serializeProperty } from "../lib/serialize";
import { getPropertyCodeConfig } from "../lib/settings";

const router: IRouter = Router();

// Postgres unique-violation error code. The properties table has a
// case-insensitive unique index on lower(code), so a duplicate insert/update
// surfaces here and we translate it into a clean 409.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

// Build the next candidate property code from a prefix, e.g. "PROP-001". Scans
// existing codes for the highest numeric suffix and increments. This is a
// best-effort guess; the DB unique index is the real guard, so callers retry on
// a unique violation to close the race between concurrent inserts.
async function nextPropertyCode(prefix: string): Promise<string> {
  const rows = await db
    .select({ code: propertiesTable.code })
    .from(propertiesTable);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}-?(\\d+)$`, "i");
  let max = 0;
  for (const r of rows) {
    const m = r.code.match(re);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser?.isSuperAdmin) {
    res.status(403).json({ error: "Only super admins can perform this action." });
    return;
  }
  next();
}

router.get("/", requirePermission("properties.view"), async (req, res) => {
  const user = req.currentUser!;
  const rows = user.isSuperAdmin
    ? await db.select().from(propertiesTable)
    : user.propertyIds.length
      ? await db
          .select()
          .from(propertiesTable)
          .where(inArray(propertiesTable.id, user.propertyIds))
      : [];
  res.json(rows.map(serializeProperty));
});

router.get("/:id", requirePermission("properties.view"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeProperty(rows[0]));
});

router.post("/", requireSuperAdmin, async (req, res) => {
  const body = validateBody(CreatePropertyBody, req, res);
  if (!body) return;

  const baseValues = {
    name: body.name,
    address: body.address,
    city: body.city,
    pincode: body.pincode,
    email: body.email,
    phone: body.phone,
    currency: body.currency ?? "INR",
    tariffPerKwh: body.tariffPerKwh ?? 0,
    timezone: body.timezone ?? "Asia/Kolkata",
    active: body.active ?? true,
  };

  // Resolve the property code according to the Software Setup configuration:
  // "auto" ignores any client-supplied code and generates a unique one; "manual"
  // requires the admin to supply a code. The DB unique index (case-insensitive)
  // is the source of truth — unique violations become a 409.
  const { mode, prefix } = await getPropertyCodeConfig();

  if (mode === "auto") {
    // Retry a few times: nextPropertyCode is a guess and a concurrent insert
    // could grab the same value first, tripping the unique index.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = await nextPropertyCode(prefix);
      try {
        const inserted = await db
          .insert(propertiesTable)
          .values({ ...baseValues, code })
          .returning();
        res.status(201).json(serializeProperty(inserted[0]!));
        return;
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    res
      .status(409)
      .json({ error: "Could not allocate a unique property code, please retry." });
    return;
  }

  const code = (body.code ?? "").trim();
  if (!code) {
    res.status(400).json({ error: "Code is required." });
    return;
  }
  try {
    const inserted = await db
      .insert(propertiesTable)
      .values({ ...baseValues, code })
      .returning();
    res.status(201).json(serializeProperty(inserted[0]!));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `Code "${code}" is already in use.` });
      return;
    }
    throw err;
  }
});

router.patch("/:id", requirePermission("properties.manage"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!canAccessProperty(req.currentUser!, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = validateBody(UpdatePropertyBody, req, res);
  if (!body) return;
  const existing = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const nextCode =
    body.code !== undefined ? body.code.trim() : undefined;
  if (nextCode !== undefined && nextCode === "") {
    res.status(400).json({ error: "Code cannot be empty." });
    return;
  }

  try {
    const updated = await db
      .update(propertiesTable)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(nextCode !== undefined ? { code: nextCode } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.pincode !== undefined ? { pincode: body.pincode } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.tariffPerKwh !== undefined
          ? { tariffPerKwh: body.tariffPerKwh }
          : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      })
      .where(eq(propertiesTable.id, id))
      .returning();
    res.json(serializeProperty(updated[0]!));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `Code "${nextCode}" is already in use.` });
      return;
    }
    throw err;
  }
});

router.delete("/:id", requireSuperAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(propertiesTable).where(eq(propertiesTable.id, id));
  res.status(204).end();
});

export default router;
