@echo off
title PowerHub Bridge - Stop
echo Stopping PowerHub Bridge...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq PowerHub Bridge*" >nul 2>&1
taskkill /F /IM wscript.exe /FI "WINDOWTITLE eq PowerHub Bridge*" >nul 2>&1
REM Fallback: kill any node process on port 8085
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8085 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Done. Bridge has been stopped.
timeout /t 2 >nul
