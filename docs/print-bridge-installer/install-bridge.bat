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

set "BRIDGE_SCRIPT="
if exist "%BRIDGE_DIR%\print-bridge-v6.3.4-generic.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.4-generic.js"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\print-bridge-v6.3.3.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.3.js"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\print-bridge-v6.3.2.js" set "BRIDGE_SCRIPT=print-bridge-v6.3.2.js"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\print-bridge.js" set "BRIDGE_SCRIPT=print-bridge.js"
if "%BRIDGE_SCRIPT%"=="" goto :no_script
echo [OK] Found bridge script: %BRIDGE_SCRIPT%
echo.

where node >nul 2>&1
if %errorLevel% NEQ 0 goto :try_install_node
goto :node_ok

:try_install_node
echo [...] Node.js not found. Looking for bundled MSI installer...
set "NODE_MSI="
for %%f in ("%BRIDGE_DIR%\node-v*-x64.msi") do set "NODE_MSI=%%f"
if "%NODE_MSI%"=="" goto :download_node
echo [OK] Found bundled installer: %NODE_MSI%
goto :run_msi

:download_node
echo [...] Bundled MSI not found. Downloading Node.js LTS from nodejs.org...
set "NODE_MSI=%BRIDGE_DIR%\node-lts-x64.msi"
set "NODE_URL=https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi"
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
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

if exist "%BRIDGE_DIR%\package.json" goto :install_from_pkg
goto :install_explicit

:install_from_pkg
echo [...] Installing dependencies from package.json...
call npm install --silent
if %errorLevel% NEQ 0 goto :npm_failed
goto :deps_done

:install_explicit
echo [...] Installing dependencies express cors body-parser sharp node-windows ...
call npm install express cors body-parser sharp node-windows --silent
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

echo [...] Waiting 6 seconds for the service to start...
timeout /t 6 /nobreak >nul

echo [...] Health check...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; if ($r.status -eq 'ok') { Write-Host '[OK] Bridge is running' } else { Write-Host '[WARN] Bridge responded but status is not ok' } } catch { Write-Host '[ERROR] Bridge did not respond - open http://127.0.0.1:3001/health manually' }"
echo.

if exist "%BRIDGE_DIR%\daemon\amwaliprintbridge.err.log" goto :show_log
goto :done

:show_log
echo [...] Last lines of error log for diagnostics:
powershell -Command "Get-Content -Path 'C:\print-bridge\daemon\amwaliprintbridge.err.log' -Tail 20"
echo.
goto :done

:done
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