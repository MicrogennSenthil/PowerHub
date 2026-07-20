import { Router, type IRouter } from "express";
import {
  blocksTable,
  floorsTable,
  roomTypesTable,
} from "@workspace/db";
import {
  CreateBlockBody,
  UpdateBlockBody,
  CreateFloorBody,
  UpdateFloorBody,
  CreateRoomTypeBody,
  UpdateRoomTypeBody,
} from "@workspace/api-zod";
import healthRouter from "./health";
import meRouter from "./me";
import permissionsRouter from "./permissions";
import propertiesRouter from "./properties";
import roomsRouter from "./rooms";
import controlTypesRouter from "./controlTypes";
import devicesRouter from "./devices";
import controlsRouter from "./controls";
import processTypesRouter from "./processTypes";
import rolesRouter from "./roles";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import { brandingPublicRouter, brandingRouter } from "./branding";
import apiKeysRouter from "./apiKeys";
import powerLogsRouter from "./powerLogs";
import reportsRouter from "./reports";
import { mhmsRouter, deviceRouter } from "./integrationPower";
import { makeSimpleMasterRouter } from "./simpleMaster";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
// Relay-box poll/ack — no session auth; the box only knows its device code
// (legacy firmware contract, plain HTTP).
router.use(deviceRouter);
// MHMS command API — authenticated by per-property API key, not Clerk.
router.use("/integration/power", mhmsRouter);
// Branding is read publicly (login/splash + castable TV welcome page render
// without an authenticated session). Writes remain authenticated below.
router.use("/branding", brandingPublicRouter);

// Everything below requires an authenticated (and provisioned) user.
router.use(requireAuth);

router.use(meRouter);
router.use(permissionsRouter);
router.use("/properties", propertiesRouter);
router.use(
  "/blocks",
  makeSimpleMasterRouter({
    table: blocksTable,
    prefix: "blocks",
    createSchema: CreateBlockBody,
    updateSchema: UpdateBlockBody,
  }),
);
router.use(
  "/floors",
  makeSimpleMasterRouter({
    table: floorsTable,
    prefix: "floors",
    createSchema: CreateFloorBody,
    updateSchema: UpdateFloorBody,
  }),
);
router.use(
  "/room-types",
  makeSimpleMasterRouter({
    table: roomTypesTable,
    prefix: "roomTypes",
    createSchema: CreateRoomTypeBody,
    updateSchema: UpdateRoomTypeBody,
  }),
);
router.use("/rooms", roomsRouter);
router.use("/control-types", controlTypesRouter);
router.use("/devices", devicesRouter);
router.use("/controls", controlsRouter);
router.use("/process-types", processTypesRouter);
router.use("/roles", rolesRouter);
router.use("/users", usersRouter);
router.use("/dashboard", dashboardRouter);
router.use("/settings", settingsRouter);
router.use("/branding", brandingRouter);
router.use("/integration/api-keys", apiKeysRouter);
router.use("/power-logs", powerLogsRouter);
router.use("/reports", reportsRouter);

export default router;
