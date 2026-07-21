// PowerHub Companion Bridge
// -------------------------
// The relay boxes (ESP32, legacy firmware) can only speak plain HTTP.
// The PowerHub server only accepts HTTPS. This tiny bridge runs on any
// always-on computer at the hotel: it accepts plain HTTP from the boxes
// and forwards every request to the PowerHub server over HTTPS.
//
// Requires Node.js (https://nodejs.org - download the LTS version).
// No npm install needed - uses only built-in modules.
//
// Usage:  node bridge.js          (reads config.json next to this file)

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cfgPath = path.join(__dirname, "config.json");
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (e) {
  console.error("Could not read config.json:", e.message);
  process.exit(1);
}

const PORT = cfg.listenPort || 8085;
const TARGET = (cfg.powerhubUrl || "").replace(/\/+$/, "");
if (!TARGET.startsWith("https://")) {
  console.error('config.json "powerhubUrl" must start with https://');
  process.exit(1);
}
const targetHost = new URL(TARGET).host;

const server = http.createServer((req, res) => {
  // Legacy firmware prefixes paths with "/index.php" (old PHP server).
  // Strip it so requests hit PowerHub's /api routes.
  if (req.url.startsWith("/index.php/")) {
    req.url = req.url.slice("/index.php".length);
  }
  // Tell PowerHub which local IP the relay box connected from, so the
  // dashboard can display the box's real network address.
  const deviceIp = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  const opts = {
    hostname: targetHost,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: targetHost, "x-device-ip": deviceIp },
  };
  const upstream = https.request(opts, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", (err) => {
    console.error(new Date().toISOString(), "FORWARD ERROR:", err.message);
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("bridge: cannot reach PowerHub server");
  });
  req.pipe(upstream);
  console.log(new Date().toISOString(), req.method, req.url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("==========================================================");
  console.log("  PowerHub Companion Bridge is RUNNING");
  console.log("  Forwarding to:", TARGET);
  console.log("");
  console.log("  In each relay box's WiFi CONFIGURATION page enter:");
  console.log("    PORT :", PORT);
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) ips.push(n.address);
    }
  }
  if (ips.length) {
    console.log("    Host :", ips.join("  or  "), " (this computer's IP)");
  } else {
    console.log("    Host : run 'ipconfig' to find this computer's IPv4 address");
  }
  console.log("");
  console.log("  Test from a browser on this network:");
  console.log(`    http://${ips[0] || "<this-pc-ip>"}:${PORT}/api/PowerDeviceApi/000010`);
  console.log("  (should show NOCMD or a command string)");
  console.log("==========================================================");
});
