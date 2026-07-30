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
import adminPropertiesRouter from "./adminProperties";
import authOtpRouter from "./authOtp";

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
// WhatsApp OTP + password-reset eligibility check — public, no Clerk session.
router.use("/auth", authOtpRouter);

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
router.use("/admin/properties", adminPropertiesRouter);

// Object-storage routes require the Replit storage sidecar (127.0.0.1:1106).
// On the VPS the sidecar doesn't exist, so we guard the import so the server
// doesn't crash — photo uploads simply return 503 outside of Replit.
if (process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
  try {
    // Dynamic require keeps the module tree free of a hard dependency on
    // @google-cloud/storage when the bucket env-var isn't present.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: storageRouter } = require("./storage");
    router.use(storageRouter);
  } catch (err: any) {
    console.warn(
      "[storage] Object storage routes not loaded — package unavailable:",
      err.message,
    );
  }
}

export default router;
