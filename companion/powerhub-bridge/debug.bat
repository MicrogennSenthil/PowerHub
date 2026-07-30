@echo off
title PowerHub Bridge (Debug Mode)
echo ==========================================================
echo   PowerHub Bridge - DEBUG / VISIBLE MODE
echo   (This window shows logs. For background mode, run
echo    install.bat or double-click start.vbs instead.)
echo ==========================================================
echo.

REM Kill any existing bridge instance on port 8085 so we can start fresh
echo  Checking for existing bridge on port 8085...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8085 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
REM Small pause to let port release
timeout /t 1 >nul

node bridge.js
echo.
echo Bridge stopped. Press any key to close.
pause >nul
