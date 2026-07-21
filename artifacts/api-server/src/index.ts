import app from "./app";
import { logger } from "./lib/logger";
import { seedSystemRoles } from "./lib/seed";
import { startAutoCutoffEngine } from "./lib/autoCutoff";
import { startDeviceMonitor } from "./jobs/deviceMonitor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedSystemRoles().catch((err) => {
  logger.error({ err }, "Failed to seed system roles");
});

startAutoCutoffEngine();
startDeviceMonitor();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
