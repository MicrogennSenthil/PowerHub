@echo off
title PowerHub Bridge (Debug Mode)
echo ==========================================================
echo   PowerHub Bridge - DEBUG / VISIBLE MODE
echo   (This window shows logs. For background mode, run
echo    install.bat or double-click start.vbs instead.)
echo ==========================================================
echo.
node bridge.js
echo.
echo Bridge stopped. Press any key to close.
pause >nul
