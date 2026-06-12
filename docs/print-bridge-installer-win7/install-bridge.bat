@echo off
title AMWALI Print Bridge - Installer
setlocal EnableDelayedExpansion

echo.
echo ============================================================
echo   AMWALI Print Bridge - Installer
echo ============================================================
echo.

net session >nul 2>&1
if %errorLevel% NEQ 0 goto :not_admin

set "BRIDGE_DIR=C:\print-bridge"
set "SERVICE_NAME=amwaliprintbridge.exe"

if not exist "%BRIDGE_DIR%" goto :no_dir
cd /d "%BRIDGE_DIR%"

REM ── Protect device.json (branch/terminal/printers config) ─────────
REM This file is NEVER shipped in the ZIP — it is created on first POS
REM setup. We must never overwrite or delete it during update.
if exist "%BRIDGE_DIR%\device.json" (
  echo [OK] device.json found — creating backup before update.
  copy /Y "%BRIDGE_DIR%\device.json" "%BRIDGE_DIR%\device.json.bak" >nul 2>&1
) else (
  if exist "%BRIDGE_DIR%\device.json.bak" (
    echo [WARN] device.json missing but device.json.bak found — restoring.
    copy /Y "%BRIDGE_DIR%\device.json.bak" "%BRIDGE_DIR%\device.json" >nul 2>&1
  ) else (
    echo [INFO] No device.json yet — device will start unbound.
  )
)

REM ── Detect Windows version (Win7 / Server 2008 R2 = 6.1) ─────────
set "IS_WIN7=0"
ver | findstr /C:" 6.1." >nul 2>&1
if %errorLevel% EQU 0 set "IS_WIN7=1"
ver | findstr /C:" 6.0." >nul 2>&1
if %errorLevel% EQU 0 set "IS_WIN7=1"
if "%IS_WIN7%"=="1" (
  echo [INFO] Windows 7 / Server 2008 detected — legacy install path enabled.
  echo [INFO]   - Node.js: bundled v13.14.0 ^(last version supporting Win7^)
  echo [INFO]   - sharp:   0.30.7 ^(last version supporting Node 13 with prebuilt^)
  echo.
  REM Force TLS 1.2 on Win7 PowerShell so npm/Invoke-WebRequest work
  set "WIN7_TLS_FIX=[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls;"
) else (
  set "WIN7_TLS_FIX="
)

REM Only one approved bridge script ships in the ZIP: v6.3.7-clean.
set "BRIDGE_SCRIPT="
if exist "%BRIDGE_DIR%\print-bridge-v6.3.7-clean.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.7-clean.js"
if "%BRIDGE_SCRIPT%"=="" goto :no_script
echo [OK] Found bridge script: %BRIDGE_SCRIPT%
echo.

where node >nul 2>&1
if %errorLevel% NEQ 0 goto :try_install_node
goto :node_ok

:try_install_node
echo [...] Node.js not found. Looking for bundled MSI installer...
set "NODE_MSI="
if "%IS_WIN7%"=="1" (
  REM Prefer Node 13.x on Win7 — never 20/24
  for %%f in ("%BRIDGE_DIR%\node-v13.*-x64.msi") do set "NODE_MSI=%%f"
  if "!NODE_MSI!"=="" for %%f in ("%BRIDGE_DIR%\node-v12.*-x64.msi") do set "NODE_MSI=%%f"
) else (
  for %%f in ("%BRIDGE_DIR%\node-v*-x64.msi") do set "NODE_MSI=%%f"
)
if "%NODE_MSI%"=="" goto :download_node
echo [OK] Found bundled installer: %NODE_MSI%
goto :run_msi

:download_node
echo [...] Bundled MSI not found. Downloading Node.js LTS from nodejs.org...
if "%IS_WIN7%"=="1" (
  set "NODE_MSI=%BRIDGE_DIR%\node-v13.14.0-x64.msi"
  set "NODE_URL=https://nodejs.org/dist/v13.14.0/node-v13.14.0-x64.msi"
) else (
  set "NODE_MSI=%BRIDGE_DIR%\node-lts-x64.msi"
  set "NODE_URL=https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi"
)
powershell -Command "try { %WIN7_TLS_FIX% [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if %errorLevel% NEQ 0 goto :no_node
if not exist "%NODE_MSI%" goto :no_node
echo [OK] Downloaded Node.js installer to %NODE_MSI%

:run_msi
echo [...] Installing Node.js silently. This may take 1-2 minutes...
msiexec /i "%NODE_MSI%" /qn /norestart
if %errorLevel% NEQ 0 echo [WARN] msiexec returned non-zero. Will re-check anyway.
set "PATH=C:\Program Files\nodejs;%PATH%"
where node >nul 2>&1
if %errorLevel% NEQ 0 goto :no_node
echo [OK] Node.js installed successfully.

:node_ok
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [OK] Node.js found - version: !NODE_VER!
echo.

REM ── On Win7, force npm to use TLS 1.2 and downgrade sharp ──────────
if "%IS_WIN7%"=="1" (
  echo [...] Configuring npm for Windows 7 ^(TLS 1.2, no audit, no fund^)...
  call npm config set registry https://registry.npmjs.org/ >nul 2>&1
  call npm config set strict-ssl true >nul 2>&1
  call npm config set audit false >nul 2>&1
  call npm config set fund false >nul 2>&1
  call npm config set msvs_version 2017 >nul 2>&1
  REM Ensure sharp prebuilt binary download succeeds on Win7
  set "npm_config_sharp_binary_host=https://github.com/lovell/sharp/releases/download"
  set "npm_config_sharp_libvips_binary_host=https://github.com/lovell/sharp-libvips/releases/download"
)

if "%IS_WIN7%"=="1" goto :install_explicit
if exist "%BRIDGE_DIR%\package.json" goto :install_from_pkg
goto :install_explicit

:install_from_pkg
echo [...] Installing dependencies from package.json...
call npm install --silent
if %errorLevel% NEQ 0 goto :npm_failed
goto :deps_done

:install_explicit
if "%IS_WIN7%"=="1" (
  echo [...] Installing Win7-compatible deps ^(sharp 0.30.7 for Node 13^)...
  call npm install express@4.19.2 cors@2.8.5 body-parser@1.20.2 sharp@0.30.7 node-windows@1.0.0-beta.8 --no-audit --no-fund --no-save --silent
) else (
  echo [...] Installing dependencies express cors body-parser sharp node-windows ...
  call npm install express cors body-parser sharp node-windows --silent
)
if %errorLevel% NEQ 0 goto :npm_failed
goto :deps_done

:deps_done
echo [OK] Dependencies installed.
echo.

if not exist "%BRIDGE_DIR%\service-install.js" goto :no_svc_script

echo [...] Stopping previous service if running...
sc stop "%SERVICE_NAME%" >nul 2>&1

echo [...] Installing Windows service: %SERVICE_NAME%
node "%BRIDGE_DIR%\service-install.js"
if %errorLevel% NEQ 0 echo [WARN] Service install returned non-zero. You can still run manually via start-bridge.bat
echo.

REM ── On Win7 we wait longer (up to 45s) and use a PSv2-compatible probe.
if "%IS_WIN7%"=="1" (
  set "HEALTH_MAX=15"
  echo [...] Waiting for the service to start ^(Windows 7 — up to 45 seconds^)...
) else (
  set "HEALTH_MAX=8"
  echo [...] Waiting for the service to start ^(up to ~24 seconds^)...
)

set "HEALTH_OK=0"
set "HEALTH_TRY=0"
:health_loop
set /a HEALTH_TRY+=1
echo     attempt !HEALTH_TRY!/!HEALTH_MAX! — probing http://127.0.0.1:3001/health ...
timeout /t 3 /nobreak >nul
REM .NET WebClient works on PowerShell v2 (Win7) — no Invoke-WebRequest / curl needed.
powershell -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls; $wc = New-Object Net.WebClient; $s = $wc.DownloadString('http://127.0.0.1:3001/health'); if ($s -match 'ok') { exit 0 } else { exit 2 } } catch { exit 1 }"
if !errorLevel! EQU 0 (
  set "HEALTH_OK=1"
  goto :health_done
)
if !HEALTH_TRY! LSS !HEALTH_MAX! goto :health_loop

:health_done
if "!HEALTH_OK!"=="1" (
  echo [OK] Bridge is online — http://127.0.0.1:3001/health
  goto :done
)

echo [ERROR] Bridge did not respond after !HEALTH_MAX! attempts.
echo.
echo ============================================================
echo   Diagnostics ^(Windows 7 safe — no -Tail, no Invoke-WebRequest^)
echo ============================================================
echo [1] Service status:
sc query "%SERVICE_NAME%" 2>nul | findstr /C:"STATE"
echo.
echo [2] Port 3001 listeners:
netstat -ano | findstr ":3001" | findstr "LISTENING"
if !errorLevel! NEQ 0 echo     ^(no listener on port 3001^)
echo.
echo [3] node.exe processes:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe"
if !errorLevel! NEQ 0 echo     ^(no node.exe running^)
echo.
echo [4] Node / npm versions:
for /f "delims=" %%v in ('node -v 2^>nul') do echo     node %%v
for /f "delims=" %%v in ('npm -v 2^>nul') do echo     npm  %%v
if "%IS_WIN7%"=="1" (
  echo     [HINT] Windows 7 detected — Node must be v13.14.0 ^(or older^).
  echo            Modern Node ^(v16+^) silently crashes on Win7 with no /health.
)
echo.
if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.err.log" (
  echo [5] Last 40 lines of amwaliprintbridge.err.log:
  powershell -NoProfile -Command "Get-Content -Path 'C:\print-bridge\daemon\amwaliprintbridge.err.log' | Select-Object -Last 40"
  echo.
)
if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.out.log" (
  echo [6] Last 40 lines of amwaliprintbridge.out.log:
  powershell -NoProfile -Command "Get-Content -Path 'C:\print-bridge\daemon\amwaliprintbridge.out.log' | Select-Object -Last 40"
  echo.
)
echo ============================================================
echo   Manual recovery:
echo     - Run start-bridge.bat to launch the bridge in a visible window
echo       and see the real crash reason directly.
if "%IS_WIN7%"=="1" echo     - On Windows 7 use start-bridge-win7.bat ^+ diagnose-win7.bat
echo ============================================================
goto :done

:done
REM ── Final safety net: if device.json got wiped during the update,
REM restore it from the backup we took at the start.
if not exist "%BRIDGE_DIR%\device.json" (
  if exist "%BRIDGE_DIR%\device.json.bak" (
    echo [WARN] device.json missing after install — restoring from backup.
    copy /Y "%BRIDGE_DIR%\device.json.bak" "%BRIDGE_DIR%\device.json" >nul 2>&1
    REM Ask the bridge to reload the restored config (best-effort)
    powershell -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/reload-config' -TimeoutSec 4 | Out-Null; Write-Host '[OK] Bridge reloaded device.json' } catch { Write-Host '[INFO] Could not reload bridge automatically — restart-bridge.bat will pick it up.' }"
  )
)

echo ============================================================
echo   Installation finished.
echo   - Open in browser: http://127.0.0.1:3001/health
echo   - Manual control:  start-bridge.bat / stop-bridge.bat
echo ============================================================
pause
endlocal
exit /b 0

:not_admin
echo [ERROR] Please run this file as Administrator.
echo Right-click the file and choose: Run as administrator
pause
exit /b 1

:no_dir
echo [ERROR] Folder %BRIDGE_DIR% not found.
echo Extract the package into C:\print-bridge and try again.
pause
exit /b 1

:no_script
echo [ERROR] Bridge script not found in %BRIDGE_DIR%.
pause
exit /b 1

:no_node
echo [ERROR] Node.js is not installed.
echo The installer tried:
echo   1) A bundled node-v*-x64.msi inside %BRIDGE_DIR% (not found).
echo   2) Downloading Node.js LTS from https://nodejs.org (failed - no internet?).
echo.
echo Fix options:
echo   - Connect this PC to the internet and re-run install-bridge.bat
echo   - OR download node-v20.18.1-x64.msi from https://nodejs.org/en/download
echo     copy it into %BRIDGE_DIR% and re-run install-bridge.bat
pause
exit /b 1

:npm_failed
echo [ERROR] npm install failed. Check your internet connection and retry.
pause
exit /b 1

:no_svc_script
echo [ERROR] service-install.js is missing from %BRIDGE_DIR%.
pause
exit /b 1