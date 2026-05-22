@echo off
chcp 65001 >nul
title AMWALI Print Bridge - Restart
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [خطأ] شغّل هذا الملف كمسؤول Administrator.
  pause
  exit /b 1
)
echo [...] إعادة تشغيل خدمة AmwaliPrintBridge ...
sc stop AmwaliPrintBridge >nul 2>&1
timeout /t 2 /nobreak >nul
sc start AmwaliPrintBridge
timeout /t 3 /nobreak >nul
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] الجسر يعمل' } catch { Write-Host '[خطأ] لم يستجب الجسر' }"
pause