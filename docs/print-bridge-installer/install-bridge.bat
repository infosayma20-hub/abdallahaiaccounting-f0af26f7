@echo off
title AMWALI Print Bridge - Installer
setlocal EnableDelayedExpansion

echo.
echo ============================================================
echo   AMWALI Print Bridge - Installer
echo ============================================================
echo.

net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [ERROR] Please run this file as Administrator.
  echo Right-click the file and choose: Run as administrator
  pause
  exit /b 1
)

set "BRIDGE_DIR=C:\print-bridge"
set "SERVICE_NAME=AmwaliPrintBridge"

if not exist "%BRIDGE_DIR%" (
  echo [ERROR] Folder %BRIDGE_DIR% not found.
  echo Extract the package into C:\print-bridge and try again.
  pause
  exit /b 1
)
cd /d "%BRIDGE_DIR%"

set "BRIDGE_SCRIPT="
if exist "%BRIDGE_DIR%\print-bridge-v6.3.4-generic.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.4-generic.js"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\print-bridge-v6.3.3.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.3.js"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\print-bridge-v6.3.2.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.2.js"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\print-bridge.js" set "BRIDGE_SCRIPT=print-bridge.js"
if "%BRIDGE_SCRIPT%"=="" (
  echo [ERROR] Bridge script not found in %BRIDGE_DIR%.
  pause
  exit /b 1
)
echo [OK] Found bridge script: %BRIDGE_SCRIPT%
echo.

where node >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [ERROR] Node.js is not installed.
  echo Download Node.js LTS from: https://nodejs.org/en/download
  echo Then restart and run this installer again.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [OK] Node.js found - version: !NODE_VER!
echo.

if exist "%BRIDGE_DIR%\package.json" (
  echo [...] Installing dependencies from package.json...
  call npm install --silent
) else (
  echo [...] Installing dependencies (express, cors, body-parser, sharp, node-windows)...
  call npm install express cors body-parser sharp node-windows --silent
)
if %errorLevel% NEQ 0 (
  echo [ERROR] npm install failed. Check your internet connection and retry.
  pause
  exit /b 1
)
echo [OK] Dependencies installed.
echo.

if not exist "%BRIDGE_DIR%\service-install.js" (
  echo [ERROR] service-install.js is missing from %BRIDGE_DIR%.
  pause
  exit /b 1
)

echo [...] Stopping previous service if running...
sc stop "%SERVICE_NAME%" >nul 2>&1

echo [...] Installing Windows service: %SERVICE_NAME%
node "%BRIDGE_DIR%\service-install.js"
if %errorLevel% NEQ 0 (
  echo [WARN] Service install returned a non-zero code. You can still run manually via start-bridge.bat
)
echo.

echo [...] Waiting 6 seconds for the service to start...
timeout /t 6 /nobreak >nul

echo [...] Health check...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; if ($r.status -eq 'ok') { Write-Host '[OK] Bridge is running' } else { Write-Host '[WARN] Bridge responded but status is not ok' } } catch { Write-Host '[ERROR] Bridge did not respond - open http://127.0.0.1:3001/health manually' }"
echo.

if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.err.log" (
  echo [...] Last lines of error log (for diagnostics):
  powershell -Command "Get-Content -Path 'C:\print-bridge\daemon\amwaliprintbridge.err.log' -Tail 20"
  echo.
)

echo ============================================================
echo   Installation finished.
echo   - Open in browser: http://127.0.0.1:3001/health
echo   - Manual control:  start-bridge.bat / stop-bridge.bat
echo ============================================================
pause
endlocal