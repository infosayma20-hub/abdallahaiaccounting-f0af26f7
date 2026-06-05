@echo off
REM Launches the Print Bridge in a VISIBLE console window so the operator
REM can see the real crash reason (Node compatibility, missing sharp,
REM EADDRINUSE, etc.) without relying on the Windows service host.
title AMWALI Print Bridge - Manual launcher (Windows 7)
setlocal
set "BRIDGE_DIR=C:\print-bridge"
if not exist "%BRIDGE_DIR%" (
  echo [ERROR] %BRIDGE_DIR% not found.
  pause
  exit /b 1
)
cd /d "%BRIDGE_DIR%"

REM Stop the service first so port 3001 is free.
sc stop "amwaliprintbridge.exe" >nul 2>&1

set "BRIDGE_SCRIPT="
if exist "print-bridge-v6.3.7-clean.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.7-clean.js"
if "%BRIDGE_SCRIPT%"=="" if exist "print-bridge-v6.3.6-clean.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.6-clean.js"
if "%BRIDGE_SCRIPT%"=="" if exist "print-bridge.js" set "BRIDGE_SCRIPT=print-bridge.js"
if "%BRIDGE_SCRIPT%"=="" (
  echo [ERROR] No bridge script found in %BRIDGE_DIR%.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   Running %BRIDGE_SCRIPT% in foreground.
echo   Press Ctrl+C to stop. Any crash / error will appear below.
echo ============================================================
echo.
node -v
echo.
node "%BRIDGE_SCRIPT%"
set "RC=%errorLevel%"
echo.
echo [exit] node exited with code %RC%
pause
exit /b %RC%