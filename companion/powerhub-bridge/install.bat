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
echo  Registering bridge to start automatically on Windows login...
set "VBSPATH=%~dp0start.vbs"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PowerHubBridge" /t REG_SZ /d "wscript.exe \"%VBSPATH%\"" /f >nul 2>&1
if errorlevel 1 (
    echo  WARNING: Could not add to startup. You can still start manually via start-bridge.bat.
) else (
    echo  SUCCESS: Bridge will auto-start every time you log in.
)

echo.
echo  Starting bridge now in background...
start "" wscript.exe "%~dp0start.vbs"

echo.
echo =======================================================
echo   Setup complete!
echo   The bridge is now running silently in the background.
echo   It will restart automatically on every Windows login.
echo.
echo   To see logs / debug: run debug.bat
echo   To stop the bridge: open Task Manager and end node.exe
echo =======================================================
echo.
pause
