@echo off
title PowerHub Companion Bridge
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org
  pause
  exit /b 1
)
:loop
node bridge.js
echo Bridge stopped. Restarting in 5 seconds... (Ctrl+C to quit)
timeout /t 5 >nul
goto loop
