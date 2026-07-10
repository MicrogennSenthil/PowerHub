import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, systemSettingsTable, type SystemSettingsRow } from "@workspace/db";
import { UpdateBrandingBody } from "@workspace/api-zod";
import { requirePermission } from "../lib/auth";
import { validateBody } from "../lib/http";
import { SETTINGS_ID } from "../lib/settings";

// Branding is intentionally split into a PUBLIC read router and an
// authenticated write router. The login/splash screen and the castable TV
// welcome page render before (or entirely without) a signed-in session, so they
// must be able to read the logo/name/colour without auth. Only these three
// non-sensitive fields are ever exposed here.

function serialize(r: SystemSettingsRow) {
  return {
    brandName: r.brandName,
    brandColor: r.brandColor,
    brandLogoUrl: r.brandLogoUrl,
  };
}

async function getOrCreate(): Promise<SystemSettingsRow> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(systemSettingsTable)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, SETTINGS_ID))
    .limit(1);
  return again[0]!;
}

// Public read — no auth. Mounted before requireAuth in routes/index.ts.
export const brandingPublicRouter: IRouter = Router();
brandingPublicRouter.get("/", async (_req, res) => {
  res.json(serialize(await getOrCreate()));
});

// Authenticated write — gated by the Smart TV permission.
export const brandingRouter: IRouter = Router();
brandingRouter.put(
  "/",
  requirePermission("smartTv.manage"),
  async (req, res) => {
    const body = validateBody(UpdateBrandingBody, req, res);
    if (!body) return;

    // Semantic validation beyond the generated schema: keep values bounded and
    // reject anything that isn't an embedded image, so the public read stays
    // lightweight and safe to render on the login/TV screens.
    if (
      body.brandName !== undefined &&
      body.brandName !== null &&
      body.brandName.length > 120
    ) {
      res.status(400).json({ error: "brandName must be 120 characters or fewer" });
      return;
    }
    if (
      body.brandColor !== undefined &&
      body.brandColor !== null &&
      !/^#[0-9a-fA-F]{6}$/.test(body.brandColor)
    ) {
      res.status(400).json({ error: "brandColor must be a hex colour like #2563eb" });
      return;
    }
    if (body.brandLogoUrl !== undefined && body.brandLogoUrl !== null) {
      if (!body.brandLogoUrl.startsWith("data:image/")) {
        res.status(400).json({ error: "brandLogoUrl must be an embedded image data URL" });
        return;
      }
      if (body.brandLogoUrl.length > 1_500_000) {
        res.status(400).json({ error: "Logo is too large; use a smaller image" });
        return;
      }
    }

    await getOrCreate();
    const updated = await db
      .update(systemSettingsTable)
      .set({
        ...(body.brandName !== undefined ? { brandName: body.brandName } : {}),
        ...(body.brandColor !== undefined
          ? { brandColor: body.brandColor }
          : {}),
        ...(body.brandLogoUrl !== undefined
          ? { brandLogoUrl: body.brandLogoUrl }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(systemSettingsTable.id, SETTINGS_ID))
      .returning();
    res.json(serialize(updated[0]!));
  },
);
