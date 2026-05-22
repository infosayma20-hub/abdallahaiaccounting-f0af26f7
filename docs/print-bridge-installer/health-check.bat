@echo off
chcp 65001 >nul
title AMWALI Print Bridge - Health Check
echo.
echo [...] فحص الجسر على http://127.0.0.1:3001/health ...
echo.
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] الجسر يعمل'; $r | ConvertTo-Json -Depth 5 } catch { Write-Host '[خطأ] لم يستجب الجسر - تأكد أن الخدمة شغالة (start-bridge.bat)' }"
echo.
pause