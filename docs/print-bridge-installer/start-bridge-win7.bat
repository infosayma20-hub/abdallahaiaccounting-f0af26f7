@echo off
REM Launches the Print Bridge in a VISIBLE console window so the operator
REM can see the real crash reason (Node compatibility, missing sharp,
REM EADDRINUSE, etc.) without relying on the Windows service host.
title AMWALI Print Bridge - Manual launcher (Windows 7)
setlocal

REM ── Locate the real bridge directory ─────────────────────────────
REM The customer may have extracted the ZIP to either:
REM   C:\print-bridge\
REM   C:\print-bridge\amwali-print-bridge\
REM   <this script's own folder>
REM Pick whichever actually contains a print-bridge-*.js file.
set "BRIDGE_DIR="
for %%D in (
  "%~dp0."
  "C:\print-bridge\amwali-print-bridge"
  "C:\print-bridge"
) do (
  if not defined BRIDGE_DIR (
    if exist "%%~fD\print-bridge-v6.3.7-clean.js" set "BRIDGE_DIR=%%~fD"
    if not defined BRIDGE_DIR if exist "%%~fD\print-bridge-v6.3.6-clean.js" set "BRIDGE_DIR=%%~fD"
    if not defined BRIDGE_DIR if exist "%%~fD\print-bridge.js" set "BRIDGE_DIR=%%~fD"
  )
)
if not defined BRIDGE_DIR (
  echo [ERROR] Could not find a print-bridge-*.js file in any of:
  echo         - %~dp0
  echo         - C:\print-bridge\amwali-print-bridge
  echo         - C:\print-bridge
  pause
  exit /b 1
)
echo [OK] Bridge directory: %BRIDGE_DIR%
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

REM ── Pre-flight environment checks ───────────────────────────────
echo.
echo [check] package.json   : 
if exist "%BRIDGE_DIR%\package.json" (echo     [OK]) else (echo     [WARN] missing — sharp/express may not load)
echo [check] node_modules   :
if exist "%BRIDGE_DIR%\node_modules" (echo     [OK]) else (echo     [X] missing — run install-bridge-win7.bat first)
echo [check] node_modules\sharp :
if exist "%BRIDGE_DIR%\node_modules\sharp" (echo     [OK]) else (echo     [X] missing — raster will fail)
echo.

REM ── Detect Node version and warn loudly on Win7 incompatibility ─
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] node not found in PATH. Install Node 13.14.0 from the bundled MSI.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [info] Node version: %NODE_VER%
REM Strip leading 'v' then look at major
set "NODE_MAJOR=%NODE_VER:~1%"
for /f "tokens=1 delims=." %%a in ("%NODE_MAJOR%") do set "NODE_MAJOR=%%a"
set "NODE_TOO_NEW=0"
if "%NODE_MAJOR%"=="14" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="15" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="16" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="17" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="18" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="19" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="20" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="21" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="22" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="23" set "NODE_TOO_NEW=1"
if "%NODE_MAJOR%"=="24" set "NODE_TOO_NEW=1"
if "%NODE_TOO_NEW%"=="1" (
  echo.
  echo ============================================================
  echo   [!!] WARNING — Node %NODE_VER% may NOT work on Windows 7.
  echo        Use Node 13.14.0 (the bundled Legacy MSI), otherwise
  echo        the bridge will likely crash immediately at startup
  echo        with no /health response.
  echo ============================================================
  echo.
)

echo.
echo ============================================================
echo   Running %BRIDGE_SCRIPT% in foreground.
echo   Press Ctrl+C to stop. Any crash / error will appear below.
echo ============================================================
echo.
node "%BRIDGE_SCRIPT%"
set "RC=%errorLevel%"
echo.
echo [exit] node exited with code %RC%
pause
exit /b %RC%