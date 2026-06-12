@echo off
REM AMWALI Print Bridge - Windows 7 / Server 2008 R2 installer wrapper.
REM Delegates to install-bridge.bat which auto-detects Win7 and switches
REM to Legacy mode (Node 13.14.0, sharp 0.30.7, longer wait, PSv2-safe
REM diagnostics). This wrapper exists so the customer can clearly pick
REM the right entry point on old hardware.
title AMWALI Print Bridge - Installer (Windows 7 Legacy)
echo.
echo ============================================================
echo   Windows 7 Legacy install path
echo   - Node 13.14.0 will be installed if missing
echo   - sharp 0.30.7 (last Win7-compatible prebuilt)
echo   - Health check waits up to 45 seconds
echo   - All diagnostics are PowerShell v2 safe (no -Tail)
echo ============================================================
echo.
call "%~dp0install-bridge.bat"
exit /b %errorLevel%