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
// spawn not needed — tray icon disabled

// Tray icon removed — caused crashes on Windows PCs where PowerShell is not
// in PATH. The bridge works identically without it; use debug.bat for logs.
function startTray(_powerhubUrl) {}

// ---------------------------------------------------------------------------
// Auto-startup registration (Windows only) — writes a registry key so the
// bridge launches automatically on login. Runs once per install location.
// ---------------------------------------------------------------------------
function registerAutoStartup() {
  if (process.platform !== "win32") return;
  const vbs = path.join(__dirname, "start.vbs");
  if (!fs.existsSync(vbs)) return;
  const regVal = `wscript.exe "${vbs}"`;
  const { execFile } = require("child_process");
  execFile(
    "reg",
    [
      "add",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v", "PowerHubBridge",
      "/t", "REG_SZ",
      "/d", regVal,
      "/f",
    ],
    (err) => {
      if (!err) console.log("  Auto-startup: registered (runs on Windows login).");
    }
  );
}

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

// Property ID for this installation — tells the server exactly which property's
// device to look up when multiple properties share the same box code.
// Set "propertyId" in config.json to the numeric ID of this property (e.g. 3).
// Leave as 0 (or omit) to fall back to the old heuristic.
const PROPERTY_ID = Number.isInteger(cfg.propertyId) && cfg.propertyId > 0
  ? cfg.propertyId
  : null;
if (PROPERTY_ID) {
  console.log("  Property scope: ID", PROPERTY_ID, "(x-property-id header will be sent)");
} else {
  console.log("  Property scope: NOT SET — edit propertyId in config.json for multi-property setups");
}

// ---------------------------------------------------------------------------
// Setup-hotspot watcher (Windows): when this PC joins the chip's config WiFi
// (SSID containing "powerconfig"), detect the gateway IP — that IS the chip's
// config page address. Remember it, print it big, and report it to PowerHub
// on the next device poll after the box comes online (x-setup-ip header).
// ---------------------------------------------------------------------------
const { execFile } = require("child_process");
let lastSetupIp = null; // { ip, at }
const SETUP_IP_FILE = path.join(__dirname, "last-setup-ip.json");
try {
  lastSetupIp = JSON.parse(fs.readFileSync(SETUP_IP_FILE, "utf8"));
} catch (_) {}

function checkSetupNetwork() {
  if (process.platform !== "win32") return;
  execFile("netsh", ["wlan", "show", "interfaces"], (err, out) => {
    if (err || !out) return;
    const ssidLine = out.split("\n").find((l) => /^\s*SSID\s*:/.test(l));
    const ssid = ssidLine ? ssidLine.split(":").slice(1).join(":").trim() : "";
    if (!/powerconfig/i.test(ssid)) return;
    execFile("ipconfig", (e2, out2) => {
      // Try the WiFi adapter's Default Gateway first.
      let ip = null;
      let guessed = false;
      if (!e2 && out2) {
        const sections = out2.split(/\r?\n(?=\S)/);
        const wlan = sections.find((s) => /Wireless|Wi-?Fi|WLAN/i.test(s.split("\n")[0])) || out2;
        const gw = wlan.match(/Default Gateway[^\d]*((?:\d{1,3}\.){3}\d{1,3})/);
        if (gw) ip = gw[1];
      }
      if (!ip) {
        // No gateway reported - derive from this PC's own address instead
        // (no text parsing needed). Chips have been seen at x.x.x.217.
        const nets = os.networkInterfaces();
        let own = null;
        for (const name of Object.keys(nets)) {
          for (const n of nets[name] || []) {
            if (n.family === "IPv4" && !n.internal) own = own || n.address;
          }
        }
        if (own) {
          ip = own.split(".").slice(0, 3).join(".") + ".217";
          guessed = true;
        }
      }
      if (!ip) {
        console.log("  [setup] On " + ssid + " but could not find the chip's address. Run ipconfig and open the Default Gateway IP in a browser.");
        return;
      }
      console.log("");
      console.log("  ********************************************************");
      console.log("  CHIP SETUP MODE DETECTED (WiFi: " + ssid + ")");
      console.log("  Config page address:  http://" + ip);
      if (guessed) {
        console.log("  (best guess - if it does not open, also try http://" + ip.split(".").slice(0, 3).join(".") + ".1)");
      }
      console.log("  (saved - will be reported to PowerHub automatically)");
      console.log("  ********************************************************");
      console.log("");
      lastSetupIp = { ip, at: Date.now() };
      try {
        fs.writeFileSync(SETUP_IP_FILE, JSON.stringify(lastSetupIp));
      } catch (_) {}
    });
  });
}
setInterval(checkSetupNetwork, 10_000);
checkSetupNetwork();

const server = http.createServer((req, res) => {
  // Legacy firmware prefixes paths with "/index.php" (old PHP server).
  // Strip it so requests hit PowerHub's /api routes.
  if (req.url.startsWith("/index.php/")) {
    req.url = req.url.slice("/index.php".length);
  }
  // Tell PowerHub which local IP the relay box connected from, so the
  // dashboard can display the box's real network address.
  const deviceIp = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  // Never pass through x-device-ip / x-setup-ip / x-property-id supplied by
  // the caller — the bridge is the only authority for these values.
  const fwdHeaders = { ...req.headers, host: targetHost };
  delete fwdHeaders["x-device-ip"];
  delete fwdHeaders["x-setup-ip"];
  delete fwdHeaders["x-property-id"];
  fwdHeaders["x-device-ip"] = deviceIp;
  // Tell the server exactly which property this bridge belongs to so it can
  // scope device lookups to (code + property_id) — eliminates any ambiguity
  // when multiple properties use the same box code (e.g. 000001).
  if (PROPERTY_ID) {
    fwdHeaders["x-property-id"] = String(PROPERTY_ID);
  }
  const opts = {
    hostname: targetHost,
    port: 443,
    path: req.url,
    method: req.method,
    headers: fwdHeaders,
  };
  // Report the most recently seen setup-page IP (detected while this PC was
  // on the chip's config hotspot within the last hour) so PowerHub can store
  // it against the box that starts polling right after configuration.
  const sendingSetupIp =
    lastSetupIp && !lastSetupIp.reported && Date.now() - lastSetupIp.at < 60 * 60 * 1000;
  if (sendingSetupIp) {
    opts.headers["x-setup-ip"] = lastSetupIp.ip;
  }
  const upstream = https.request(opts, (up) => {
    // Once PowerHub has accepted a poll carrying the setup IP, stop sending it
    // so it can't be attached to a different box that polls later.
    if (sendingSetupIp && up.statusCode && up.statusCode < 300) {
      lastSetupIp.reported = true;
      try {
        fs.writeFileSync(SETUP_IP_FILE, JSON.stringify(lastSetupIp));
      } catch (_) {}
    }
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

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("");
    console.error("  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("  ERROR: Port " + PORT + " is already in use.");
    console.error("");
    console.error("  The bridge is most likely already running in the");
    console.error("  background (started by install.bat or auto-startup).");
    console.error("");
    console.error("  To fix:");
    console.error("    1. Open Task Manager (Ctrl+Shift+Esc)");
    console.error("    2. Find 'node.exe' under Background Processes");
    console.error("    3. Right-click -> End Task");
    console.error("    4. Run debug.bat again");
    console.error("");
    console.error("  OR just run  stop-bridge.bat  then  debug.bat");
    console.error("  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("");
  } else {
    console.error("Server error:", err.message);
  }
  process.exit(1);
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

  // Start tray icon (Windows only — hides console when launched via start.vbs)
  startTray(TARGET);
  // Register auto-startup in Windows registry so bridge runs on every login
  registerAutoStartup();
});
