@echo off
chcp 65001 >nul
title AMWALI Print Bridge - Uninstall Service
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [خطأ] شغّل هذا الملف كمسؤول Administrator.
  pause
  exit /b 1
)
cd /d C:\print-bridge
if not exist service-uninstall.js (
  echo [خطأ] ملف service-uninstall.js غير موجود.
  pause
  exit /b 1
)
echo [...] إزالة خدمة AmwaliPrintBridge ...
node service-uninstall.js
echo [OK] تمت الإزالة.
pause