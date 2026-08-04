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

2. Open  config.json  in Notepad and set your property code:

     "propertyCode": "KDS"

   Replace KDS with THIS property's short code.
   HOW TO FIND YOUR PROPERTY CODE:
     - Log in to https://power.microgenn.com
     - Go to Masters → Properties
     - Use the CODE column for your property (e.g. KDS, MDM).
       Upper/lower case does not matter.

   Leave "powerhubUrl" and "listenPort" unchanged unless instructed.

3. Double-click  install.bat
   - Registers the bridge to auto-start on Windows login.
   - Starts the bridge immediately in the background.

   When the bridge starts you will see:
     Property scope: code KDS (x-property-code header will be sent)
   This confirms the bridge is correctly linked to your property.

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
  http://<this-PC-IP>:8085/api/PowerDeviceApi/000001
  (should return NOCMD or a command string)

STOPPING THE BRIDGE
-------------------
Run  stop-bridge.bat  or open Task Manager → find node.exe → End Task.
Then run  start-bridge.bat  (or  debug.bat  to see logs) to restart.

CONFIG REFERENCE  (config.json)
---------------------------------
  "powerhubUrl"  : Server address. Do not change unless the server moves.
                   Default: https://power.microgenn.com

  "listenPort"   : Port the bridge listens on for relay box connections.
                   Default: 8085. Change only if another app uses 8085.

  "propertyCode" : Short code of the property where this bridge is
                   installed (e.g. "KDS"). MUST be set correctly so
                   relay commands go to the right property. Find it in
                   Masters → Properties on the PowerHub dashboard.
                   (Older configs with a numeric "propertyId" still
                   work, but propertyCode is preferred.)

UPGRADING FROM AN OLDER BRIDGE
-------------------------------
If you received a previous version of this package without propertyCode:
1. Copy your existing config.json "powerhubUrl" value.
2. Replace config.json with the new one from this package.
3. Paste your powerhubUrl back in.
4. Set "propertyCode" to the correct code for this site.
5. Restart: stop-bridge.bat then start-bridge.bat

TROUBLESHOOTING
---------------
- Bridge says "Property scope: NOT SET":
    Open config.json and set "propertyCode" to your property's code.

- Bridge polls return UNKNOWN for every device:
    The "propertyCode" in config.json does not exist on the server.
    Check the spelling against Masters → Properties.

- Relay box not polling (device shows Offline in PowerHub):
    1. Check the box's WiFi config page — HOST must be this PC's IP,
       PORT must be 8085.
    2. Run debug.bat and watch for incoming poll requests.
    3. Make sure this PC and the relay box are on the same local network.

- "Cannot reach PowerHub server":
    Check internet connectivity on this PC.
    Verify "powerhubUrl" in config.json is https://power.microgenn.com
