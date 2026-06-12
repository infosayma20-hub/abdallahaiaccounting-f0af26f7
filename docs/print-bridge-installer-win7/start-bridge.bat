@echo off
title AMWALI Print Bridge - Start
net session >nul 2>&1
if %errorLevel% NEQ 0 goto :not_admin
echo [...] Starting AmwaliPrintBridge service...
sc start "amwaliprintbridge.exe"
if %errorLevel% NEQ 0 goto :manual_start
goto :after_start

:manual_start
echo [WARN] Service not found. Starting bridge directly...
cd /d C:\print-bridge
if exist print-bridge-v6.3.6-clean.js goto :run_634
if exist print-bridge-v6.3.3.js goto :run_633
if exist print-bridge-v6.3.2.js goto :run_632
goto :run_default

:run_634
start "AMWALI Print Bridge" node print-bridge-v6.3.6-clean.js
goto :after_start
:run_633
start "AMWALI Print Bridge" node print-bridge-v6.3.3.js
goto :after_start
:run_632
start "AMWALI Print Bridge" node print-bridge-v6.3.2.js
goto :after_start
:run_default
start "AMWALI Print Bridge" node print-bridge.js
goto :after_start

:after_start
timeout /t 3 /nobreak >nul
echo [...] Health check...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] Bridge is running' } catch { Write-Host '[ERROR] Bridge did not respond' }"
pause
exit /b 0

:not_admin
echo [ERROR] Please run this file as Administrator.
pause
exit /b 1