@echo off
title AMWALI Print Bridge - Windows 7 Diagnostics
setlocal EnableDelayedExpansion
set "BRIDGE_DIR=C:\print-bridge"
set "SERVICE_NAME=amwaliprintbridge.exe"

echo.
echo ============================================================
echo   AMWALI Print Bridge — Windows 7 Diagnostics
echo   (no -Tail, no Invoke-WebRequest, no curl)
echo ============================================================
echo.

echo [1] Windows version:
ver
echo.

echo [2] Node / npm:
where node >nul 2>&1
if !errorLevel! NEQ 0 (
  echo     [X] node not found in PATH
) else (
  for /f "delims=" %%v in ('node -v') do echo     node %%v
  for /f "delims=" %%v in ('npm -v 2^>nul') do echo     npm  %%v
  echo     [HINT] On Windows 7, Node MUST be v13.14.0 or older.
  echo            Newer Node silently crashes at startup.
)
echo.

echo [3] Service status:
sc query "%SERVICE_NAME%" 2>nul | findstr /C:"STATE" /C:"SERVICE_NAME"
if !errorLevel! NEQ 0 echo     [X] service %SERVICE_NAME% is not installed
echo.

echo [4] Port 3001 listeners:
netstat -ano | findstr ":3001" | findstr "LISTENING"
if !errorLevel! NEQ 0 echo     (no listener on 3001)
echo.

echo [5] node.exe processes:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe"
if !errorLevel! NEQ 0 echo     (no node.exe running)
echo.

echo [6] Bridge folder contents:
if exist "%BRIDGE_DIR%" (
  if exist "%BRIDGE_DIR%\print-bridge-v6.3.7-clean.js" echo     [OK] print-bridge-v6.3.7-clean.js
  if exist "%BRIDGE_DIR%\print-bridge-v6.3.6-clean.js" echo     [OK] print-bridge-v6.3.6-clean.js
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
  powershell -NoProfile -Command "Get-Content -Path 'C:\print-bridge\daemon\amwaliprintbridge.err.log' | Select-Object -Last 40"
  echo.
)
if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.out.log" (
  echo [9] Last 40 lines of amwaliprintbridge.out.log:
  powershell -NoProfile -Command "Get-Content -Path 'C:\print-bridge\daemon\amwaliprintbridge.out.log' | Select-Object -Last 40"
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