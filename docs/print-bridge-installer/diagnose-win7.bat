@echo off
title AMWALI Print Bridge - Windows 7 Diagnostics
setlocal EnableDelayedExpansion
set "SERVICE_NAME=amwaliprintbridge.exe"

REM ── Auto-detect bridge directory ────────────────────────────────
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
if not defined BRIDGE_DIR set "BRIDGE_DIR=C:\print-bridge"

echo.
echo ============================================================
echo   AMWALI Print Bridge — Windows 7 Diagnostics
echo   (no -Tail, no Invoke-WebRequest, no curl)
echo ============================================================
echo.
echo Detected bridge directory: %BRIDGE_DIR%
echo.

echo [1] Windows version:
ver
echo.

echo [2] Node / npm:
where node >nul 2>&1
if !errorLevel! NEQ 0 (
  echo     [X] node not found in PATH
) else (
  for /f "delims=" %%v in ('node -v') do (
    set "NODE_VER=%%v"
    echo     node %%v
  )
  for /f "delims=" %%v in ('npm -v 2^>nul') do echo     npm  %%v
  set "NODE_MAJOR=!NODE_VER:~1!"
  for /f "tokens=1 delims=." %%a in ("!NODE_MAJOR!") do set "NODE_MAJOR=%%a"
  set "NODE_TOO_NEW=0"
  for %%N in (14 15 16 17 18 19 20 21 22 23 24) do if "!NODE_MAJOR!"=="%%N" set "NODE_TOO_NEW=1"
  if "!NODE_TOO_NEW!"=="1" (
    echo.
    echo     [!!] نسخة Node الحالية ^(!NODE_VER!^) قد لا تعمل على Windows 7.
    echo          استخدم Node 13.14 أو نسخة Legacy المرفقة في الـ ZIP.
    echo          Newer Node silently crashes at startup on Win7.
  ) else (
    echo     [OK] Node version looks Win7-compatible ^(v13 or older^).
  )
)
echo.

echo [3] Service status / config:
sc query "%SERVICE_NAME%" 2>nul | findstr /C:"STATE" /C:"SERVICE_NAME"
if !errorLevel! NEQ 0 echo     [X] service %SERVICE_NAME% is not installed
echo.
echo     Service binary / command line ^(BINARY_PATH_NAME^):
sc qc "%SERVICE_NAME%" 2>nul | findstr /C:"BINARY_PATH_NAME"
echo.

echo [4] Port 3001 listeners:
netstat -ano | findstr ":3001" | findstr "LISTENING"
if !errorLevel! NEQ 0 echo     (no listener on 3001)
echo.

echo [5] node.exe processes:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe"
if !errorLevel! NEQ 0 echo     (no node.exe running)
echo.

echo [6] Bridge folder contents at %BRIDGE_DIR%:
if exist "%BRIDGE_DIR%" (
  set "MAIN_FOUND=0"
  if exist "%BRIDGE_DIR%\print-bridge-v6.3.7-clean.js" ( echo     [OK] print-bridge-v6.3.7-clean.js & set "MAIN_FOUND=1" )
  if exist "%BRIDGE_DIR%\print-bridge-v6.3.6-clean.js" ( echo     [OK] print-bridge-v6.3.6-clean.js & set "MAIN_FOUND=1" )
  if exist "%BRIDGE_DIR%\print-bridge.js" ( echo     [OK] print-bridge.js & set "MAIN_FOUND=1" )
  if "!MAIN_FOUND!"=="0" echo     [X] main bridge .js file NOT FOUND in this folder.
  if exist "%BRIDGE_DIR%\package.json" ( echo     [OK] package.json ) else ( echo     [X]  package.json MISSING )
  if exist "%BRIDGE_DIR%\node_modules" ( echo     [OK] node_modules ) else ( echo     [X]  node_modules MISSING — run install-bridge-win7.bat )
  if exist "%BRIDGE_DIR%\node_modules\sharp" (
    echo     [OK] node_modules\sharp present
  ) else (
    echo     [X]  node_modules\sharp MISSING — npm install did not complete
  )
  if exist "%BRIDGE_DIR%\device.json" (echo     [OK] device.json present) else (echo     [INFO] device.json not yet created)
) else (
  echo     [X] %BRIDGE_DIR% does not exist
)
echo.

echo [7] Health probe (MSXML2.XMLHTTP via VBScript):
if exist "%~dp0health-check.vbs" (
  cscript //nologo "%~dp0health-check.vbs"
) else (
  echo     [WARN] health-check.vbs missing — using PowerShell WebClient fallback
  powershell -NoProfile -Command "try { $wc = New-Object Net.WebClient; Write-Host $wc.DownloadString('http://127.0.0.1:3001/health') } catch { Write-Host '[ERROR]' $_.Exception.Message }"
)
echo.

if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.err.log" (
  echo [8] Last 40 lines of amwaliprintbridge.err.log:
  powershell -NoProfile -Command "Get-Content -Path '%BRIDGE_DIR%\daemon\amwaliprintbridge.err.log' | Select-Object -Last 40"
  echo.
)
if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.out.log" (
  echo [9] Last 40 lines of amwaliprintbridge.out.log:
  powershell -NoProfile -Command "Get-Content -Path '%BRIDGE_DIR%\daemon\amwaliprintbridge.out.log' | Select-Object -Last 40"
  echo.
)

echo ============================================================
echo   If the service is Running but health fails:
echo     - The bridge process is crashing immediately after start.
echo     - Run start-bridge-win7.bat to see the real crash reason
echo       in a visible window.
echo   If Node version is v16 / v18 / v20 / v22 / v24 on Windows 7:
echo     - That Node is NOT compatible with Win7.
echo     - Uninstall it and re-run install-bridge-win7.bat so the
echo       bundled Node 13.14.0 is installed instead.
echo ============================================================
pause
endlocal
exit /b 0