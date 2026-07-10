import { Router, type IRouter } from "express";
import { PERMISSION_CATALOG } from "../lib/permissions";

const router: IRouter = Router();

router.get("/permissions", (_req, res) => {
  res.json(PERMISSION_CATALOG);
});

export default router;
