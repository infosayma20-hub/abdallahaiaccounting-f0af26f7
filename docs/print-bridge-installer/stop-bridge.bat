@echo off
title AMWALI Print Bridge - Stop
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [ERROR] Please run this file as Administrator.
  pause
  exit /b 1
)
echo [...] Stopping AmwaliPrintBridge service...
sc stop AmwaliPrintBridge
echo [...] Killing any node process on port 3001...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  echo killing PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
echo [OK] Stopped.
pause