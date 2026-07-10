import { Router, type IRouter } from "express";
import { inArray } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { serializeProperty } from "../lib/serialize";

const router: IRouter = Router();

router.get("/me", async (req, res) => {
  const user = req.currentUser!;
  const properties = user.isSuperAdmin
    ? await db.select().from(propertiesTable)
    : user.propertyIds.length
      ? await db
          .select()
          .from(propertiesTable)
          .where(inArray(propertiesTable.id, user.propertyIds))
      : [];

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    roleId: user.roleId,
    roleName: user.roleName,
    permissions: user.permissions,
    properties: properties.map(serializeProperty),
  });
});

export default router;
