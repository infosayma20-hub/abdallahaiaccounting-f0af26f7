@echo off
title AMWALI Print Bridge - Health Check
echo.
echo [...] Checking bridge at http://127.0.0.1:3001/health ...
echo.
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] Bridge is running'; $r | ConvertTo-Json -Depth 5 } catch { Write-Host '[ERROR] Bridge did not respond - make sure the service is running (start-bridge.bat)' }"
echo.
pause