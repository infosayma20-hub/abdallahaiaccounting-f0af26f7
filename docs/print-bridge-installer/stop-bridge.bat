@echo off
chcp 65001 >nul
title AMWALI Print Bridge - Stop
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [خطأ] شغّل هذا الملف كمسؤول Administrator.
  pause
  exit /b 1
)
echo [...] إيقاف خدمة AmwaliPrintBridge ...
sc stop AmwaliPrintBridge
echo [...] إنهاء أي عملية node على المنفذ 3001 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  echo killing PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
echo [OK] تم الإيقاف.
pause