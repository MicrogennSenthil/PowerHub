import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, apiKeysTable, type ApiKeyRow } from "@workspace/db";

// Machine auth for external systems (MHMS). Keys look like "phk_<40 hex>".
// Only the SHA-256 hash is stored.

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `phk_${randomBytes(20).toString("hex")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRow;
    }
  }
}

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Header only — query-string tokens leak into proxy/access logs.
  const raw = req.header("x-api-key");
  if (!raw) {
    res.status(401).json({ error: "Missing X-API-Key header" });
    return;
  }
  const rows = await db
    .select()
    .from(apiKeysTable)
    .where(
      and(eq(apiKeysTable.keyHash, hashApiKey(raw)), eq(apiKeysTable.active, true)),
    )
    .limit(1);
  if (!rows[0]) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  req.apiKey = rows[0];
  // Fire-and-forget usage stamp.
  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, rows[0].id))
    .then(
      () => {},
      () => {},
    );
  next();
}
