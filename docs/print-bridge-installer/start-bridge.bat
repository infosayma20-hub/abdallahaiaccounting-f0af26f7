@echo off
title AMWALI Print Bridge - Start
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [ERROR] Please run this file as Administrator.
  pause
  exit /b 1
)
echo [...] Starting AmwaliPrintBridge service...
sc start AmwaliPrintBridge
if %errorLevel% NEQ 0 (
  echo [WARN] Service not found. Starting bridge directly...
  cd /d C:\print-bridge
  if exist print-bridge-v6.3.4-generic.js (
    start "AMWALI Print Bridge" node print-bridge-v6.3.4-generic.js
  ) else if exist print-bridge-v6.3.3.js (
    start "AMWALI Print Bridge" node print-bridge-v6.3.3.js
  ) else if exist print-bridge-v6.3.2.js (
    start "AMWALI Print Bridge" node print-bridge-v6.3.2.js
  ) else (
    start "AMWALI Print Bridge" node print-bridge.js
  )
)
timeout /t 3 /nobreak >nul
echo [...] Health check...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] Bridge is running' } catch { Write-Host '[ERROR] Bridge did not respond' }"
pause