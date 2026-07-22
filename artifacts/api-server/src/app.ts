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

export default app;
