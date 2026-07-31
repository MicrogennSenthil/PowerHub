import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Proxy Clerk Frontend API through our domain. Must be mounted BEFORE body
// parsers because it streams raw bytes.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// 2mb accommodates small logo data URLs stored via the branding endpoint while
// still bounding request size.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Legacy ESP32 relay firmware polls paths prefixed with "/index.php" (a
// leftover from the old CodeIgniter server). Strip the prefix so those
// requests hit the same /api routes.
app.use((req, _res, next) => {
  if (req.url.startsWith("/index.php/")) {
    req.url = req.url.slice("/index.php".length);
  }
  next();
});

// Public static downloads (no auth) — e.g. PowerHub Bridge installer
app.use(
  "/api/download",
  express.static(path.join(__dirname, "../public"), {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".zip")) {
        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
      }
    },
  }),
);

app.use("/api", router);

// Global error handler — catches any unhandled error from async route handlers
// (Express 5 forwards them automatically). Returns JSON instead of the default
// HTML 500 page so the frontend can display a readable message.
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    logger.error({ err }, "Unhandled request error");

    // PostgreSQL unique_violation (23505)
    if (err?.code === "23505") {
      const column = err?.constraint ?? "";
      if (column.includes("code")) {
        res.status(409).json({
          error: "A device with this code already exists. Each relay board must have a globally unique code.",
        });
        return;
      }
      res.status(409).json({ error: "A record with that value already exists." });
      return;
    }

    const status: number =
      typeof err?.status === "number" ? err.status :
      typeof err?.statusCode === "number" ? err.statusCode : 500;

    res.status(status).json({
      error: err?.message ?? "Internal server error",
    });
  },
);

export default app;
