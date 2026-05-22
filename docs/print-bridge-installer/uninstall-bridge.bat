@echo off
title AMWALI Print Bridge - Uninstall Service
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [ERROR] Please run this file as Administrator.
  pause
  exit /b 1
)
cd /d C:\print-bridge
if not exist service-uninstall.js (
  echo [ERROR] service-uninstall.js not found in C:\print-bridge.
  pause
  exit /b 1
)
echo [...] Removing AmwaliPrintBridge service...
node service-uninstall.js
echo [OK] Service removed.
pause