PowerHub Companion Bridge
=========================

WHAT IT DOES
The relay boxes speak plain HTTP. The PowerHub server needs HTTPS.
This bridge runs on one always-on computer at the hotel and translates
between the two. If this computer is off, the boxes cannot receive
commands - keep it running 24/7 for real operation.

SETUP (Windows)
1. Install Node.js (LTS) from https://nodejs.org  - next, next, finish.
2. Copy this folder anywhere, e.g. C:\powerhub-bridge
3. Open config.json in Notepad and check "powerhubUrl" points to your
   PowerHub server address. (When the app is published to a permanent
   address, update this one line.)
4. Double-click start-bridge.bat
   A black window opens and shows the exact PORT and Host IP to type
   into each relay box's WiFi CONFIGURATION page.

CONFIGURE EACH RELAY BOX
   PORT      : 8085
   Device ID : the box's number (e.g. 000010)
   Host      : this computer's IP shown in the bridge window
               (e.g. 192.168.250.105 - NOT any internet IP)

TEST
Open in a browser on the same network:
   http://<this-pc-ip>:8085/api/PowerDeviceApi/000010
If you see NOCMD (or a command string), the bridge works.

AUTOSTART WITH WINDOWS (recommended)
Press Win+R, type: shell:startup
Copy a shortcut of start-bridge.bat into that folder.

IMPORTANT
- Give this computer a FIXED IP on the router (DHCP reservation),
  otherwise the IP may change after a reboot and boxes will lose it.
- Allow port 8085 through Windows Firewall if boxes cannot connect
  (Windows usually asks the first time - click "Allow").
