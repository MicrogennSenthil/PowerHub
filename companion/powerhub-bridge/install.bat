@echo off
title PowerHub Bridge - Setup
echo =======================================================
echo   PowerHub Bridge - One-Click Setup
echo =======================================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo  Download from https://nodejs.org  ^(LTS version^)
    echo  Re-run this installer after installing Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo  Node.js found: %%v

echo.
echo  Adding bridge to Windows startup ^(runs at login^)...
set "VBSPATH=%~dp0start.vbs"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PowerHubBridge" /t REG_SZ /d "wscript.exe \"%VBSPATH%\"" /f >nul 2>&1
if errorlevel 1 (
    echo  WARNING: Could not add to startup. You can still start manually.
) else (
    echo  SUCCESS: Bridge will auto-start every time you log in.
)

echo.
echo  Starting bridge now ^(tray icon^)...
start "" wscript.exe "%~dp0start.vbs"

echo.
echo =======================================================
echo   Setup complete!
echo   - The bridge is now running in the background.
echo   - Look for the PowerHub icon in your system tray.
echo   - Double-click tray icon for status.
echo   - Right-click tray icon to stop.
echo   - On next login it starts automatically.
echo =======================================================
echo.
pause
