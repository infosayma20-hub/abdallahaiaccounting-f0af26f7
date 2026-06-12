@echo off
title AMWALI Print Bridge - System Check
setlocal EnableDelayedExpansion

echo.
echo ============================================================
echo   AMWALI Print Bridge - System Diagnostics
echo ============================================================
echo.

echo [1] Windows version:
ver
set "IS_WIN7=0"
ver | findstr /C:" 6.1." >nul 2>&1
if %errorLevel% EQU 0 set "IS_WIN7=1"
if "%IS_WIN7%"=="1" (
  echo     -^> Windows 7 / Server 2008 R2 detected.
  echo        Required Node: v13.14.0  ^|  Required sharp: 0.32.6
) else (
  echo     -^> Modern Windows ^(8/10/11/Server 2012+^) detected.
  echo        Any Node LTS works.
)
echo.

echo [2] Node.js:
where node >nul 2>&1
if %errorLevel% NEQ 0 (
  echo     [X] Node.js is NOT installed.
) else (
  for /f "delims=" %%v in ('node -v') do echo     [OK] node %%v
  for /f "delims=" %%v in ('npm -v') do echo     [OK] npm  %%v
)
echo.

echo [3] TLS support ^(needed for npm/Invoke-WebRequest^):
powershell -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host '    [OK] TLS 1.2 available' } catch { Write-Host '    [X]  TLS 1.2 NOT available — required for downloads' }"
echo.

echo [4] Bridge folder:
if exist "C:\print-bridge" (
  echo     [OK] C:\print-bridge exists
  if exist "C:\print-bridge\print-bridge-v6.3.7-clean.js" echo     [OK] bridge script present
  if exist "C:\print-bridge\node_modules\sharp" (
    echo     [OK] node_modules\sharp present
    dir /b "C:\print-bridge\node_modules\sharp\build\Release\*.node" 2>nul
  ) else (
    echo     [X]  node_modules\sharp MISSING — npm install did not complete
  )
  if exist "C:\print-bridge\device.json" echo     [OK] device.json present
) else (
  echo     [X] C:\print-bridge folder missing
)
echo.

echo [5] Bundled Node MSI files:
for %%f in ("C:\print-bridge\node-v*-x64.msi") do echo     [OK] %%f
echo.

echo [6] Bridge health endpoint:
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 3; Write-Host '    [OK] running — version' $r.version } catch { Write-Host '    [X] not responding on 127.0.0.1:3001' }"
echo.

echo ============================================================
pause
endlocal