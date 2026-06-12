@echo off
title AMWALI Print Bridge - Startup Fallback Installer
setlocal

set "BRIDGE_DIR=C:\print-bridge"
set "VBS_FILE=%BRIDGE_DIR%\start-bridge-hidden.vbs"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_DIR%\AmwaliPrintBridge.lnk"

echo.
echo ============================================================
echo   AMWALI Print Bridge - Startup Fallback Installer
echo   (Use only if Windows Service install failed)
echo ============================================================
echo.

if not exist "%VBS_FILE%" (
  echo [ERROR] %VBS_FILE% not found.
  echo Extract the package into C:\print-bridge first.
  pause
  exit /b 1
)

if not exist "%STARTUP_DIR%" (
  echo [ERROR] Startup folder not found: %STARTUP_DIR%
  pause
  exit /b 1
)

echo [...] Creating Startup shortcut for current user...
powershell -NoProfile -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%VBS_FILE%'; $s.WorkingDirectory = '%BRIDGE_DIR%'; $s.Description = 'AMWALI Print Bridge (hidden)'; $s.Save()"

if exist "%SHORTCUT%" (
  echo [OK] Shortcut created: %SHORTCUT%
  echo [OK] Bridge will auto-start on next login.
  echo.
  echo [...] Starting bridge now in the background...
  wscript "%VBS_FILE%"
  timeout /t 3 /nobreak >nul
  powershell -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5 | Out-Null; Write-Host '[OK] Bridge is running' } catch { Write-Host '[WARN] Bridge did not respond yet - check manually at http://127.0.0.1:3001/health' }"
) else (
  echo [ERROR] Failed to create shortcut.
  pause
  exit /b 1
)

echo.
pause
endlocal
