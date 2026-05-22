@echo off
chcp 65001 >nul
title AMWALI Print Bridge - Start
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [خطأ] شغّل هذا الملف كمسؤول Administrator.
  pause
  exit /b 1
)
echo [...] تشغيل خدمة AmwaliPrintBridge ...
sc start AmwaliPrintBridge
if %errorLevel% NEQ 0 (
  echo [تحذير] الخدمة غير موجودة. تشغيل مباشر بدلاً من الخدمة ...
  cd /d C:\print-bridge
  if exist print-bridge-v6.3.2.js (
    start "AMWALI Print Bridge" node print-bridge-v6.3.2.js
  ) else (
    start "AMWALI Print Bridge" node print-bridge.js
  )
)
timeout /t 3 /nobreak >nul
echo [...] فحص الحالة ...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host '[OK] الجسر يعمل' } catch { Write-Host '[خطأ] لم يستجب الجسر' }"
pause