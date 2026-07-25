PowerHub Companion Bridge
=========================

WHAT IT DOES
------------
The relay boxes (ESP32) speak plain HTTP. PowerHub requires HTTPS.
This bridge runs on any always-on Windows PC at the hotel. It accepts
plain HTTP from the relay boxes and forwards every request securely to
https://power.microgenn.com over HTTPS.

REQUIREMENTS
------------
- Windows 7 / 10 / 11
- Node.js (download LTS from https://nodejs.org)

FIRST-TIME SETUP
----------------
1. Install Node.js if not already installed.
2. Double-click  install.bat
   - Registers the bridge to auto-start on Windows login.
   - Starts the bridge immediately in the background.

DAILY USE
---------
After install.bat runs once, the bridge starts automatically every
time you log in to Windows. Nothing else to do.

DEBUG / LOGS
------------
Double-click  debug.bat  to see the bridge logs in a visible window.
Useful for troubleshooting relay box connectivity.

RELAY BOX CONFIGURATION
-----------------------
In each relay box's WiFi configuration page, enter:
  HOST : <this PC's IP address>   (run ipconfig to find it)
  PORT : 8085

Test the connection from any browser on the local network:
  http://<this-PC-IP>:8085/api/PowerDeviceApi/000010
  (should return NOCMD or a command string)

STOPPING THE BRIDGE
-------------------
Open Task Manager → find  node.exe → End Task.

CONFIG
------
config.json controls where requests are forwarded and which port to listen on.
  "powerhubUrl"  : https://power.microgenn.com  (do not change unless server moves)
  "listenPort"   : 8085  (change if port conflicts with another app)
