@echo off
title AMWALI Print Bridge - Restart
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [ERROR] Please run this file as Administrator.
  pause
  exit /b 1
)
echo [...] Restarting AmwaliPrintBridge service...
sc stop AmwaliPrintBridge >nul 2>&1
timeout /t 2 /nobreak >nul
sc start AmwaliPrintBridge
timeout /t 3 /nobreak >nul
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] Bridge is running' } catch { Write-Host '[ERROR] Bridge did not respond' }"
pause