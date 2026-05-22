@echo off
chcp 65001 >nul
title AMWALI Print Bridge - Installer
setlocal EnableDelayedExpansion

REM ============================================================
REM  AMWALI Print Bridge - One-click installer (Windows)
REM  Run AS ADMINISTRATOR (right-click -> Run as administrator)
REM ============================================================

echo.
echo ============================================================
echo   AMWALI Print Bridge - Installer
echo   مثبّت جسر الطباعة لأموالي
echo ============================================================
echo.

REM --- Require Administrator ---------------------------------
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [خطأ] يجب تشغيل هذا الملف كمسؤول Administrator.
  echo اضغط بزر الماوس الأيمن واختر: Run as administrator
  echo.
  pause
  exit /b 1
)

set "BRIDGE_DIR=C:\print-bridge"
set "BRIDGE_FILE=print-bridge-v6.3.2.js"
set "FALLBACK_FILE=print-bridge.js"
set "SERVICE_NAME=AmwaliPrintBridge"

if not exist "%BRIDGE_DIR%" (
  echo [خطأ] المجلد %BRIDGE_DIR% غير موجود.
  echo الرجاء فك ضغط الملفات داخل C:\print-bridge ثم أعد التشغيل.
  pause
  exit /b 1
)
cd /d "%BRIDGE_DIR%"

set "BRIDGE_SCRIPT="
if exist "%BRIDGE_DIR%\%BRIDGE_FILE%" set "BRIDGE_SCRIPT=%BRIDGE_FILE%"
if "%BRIDGE_SCRIPT%"=="" if exist "%BRIDGE_DIR%\%FALLBACK_FILE%" set "BRIDGE_SCRIPT=%FALLBACK_FILE%"
if "%BRIDGE_SCRIPT%"=="" (
  echo [خطأ] لم يتم العثور على ملف الجسر داخل %BRIDGE_DIR%.
  echo توقع أحد الملفات: %BRIDGE_FILE% أو %FALLBACK_FILE%
  pause
  exit /b 1
)
echo [OK] تم العثور على: %BRIDGE_SCRIPT%
echo.

where node >nul 2>&1
if %errorLevel% NEQ 0 (
  echo [خطأ] Node.js غير مثبّت على هذا الجهاز.
  echo.
  echo نزّل وثبّت Node.js LTS من الرابط:
  echo     https://nodejs.org/en/download
  echo.
  echo بعد التثبيت أعد تشغيل الكمبيوتر ثم شغّل هذا الملف مرة أخرى.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [OK] Node.js مثبّت — الإصدار: !NODE_VER!
echo.

echo [...] تثبيت الحزم المطلوبة (express, sharp) ...
if not exist "%BRIDGE_DIR%\package.json" (
  call npm init -y >nul 2>&1
)
call npm install express sharp --silent
if %errorLevel% NEQ 0 (
  echo [تحذير] فشل تثبيت بعض الحزم. تأكد من اتصال الإنترنت ثم أعد المحاولة.
  pause
  exit /b 1
)
echo [OK] تم تثبيت الحزم.
echo.

echo [...] تثبيت node-windows لتشغيل الجسر كخدمة ...
call npm install node-windows --silent
if %errorLevel% NEQ 0 (
  echo [تحذير] تعذّر تثبيت node-windows.
  pause
  exit /b 1
)
echo [OK] node-windows جاهز.
echo.

set "SVC_FILE=%BRIDGE_DIR%\service-install.js"
>"%SVC_FILE%" echo var Service = require('node-windows').Service;
>>"%SVC_FILE%" echo var path = require('path');
>>"%SVC_FILE%" echo var svc = new Service({
>>"%SVC_FILE%" echo   name: 'AmwaliPrintBridge',
>>"%SVC_FILE%" echo   description: 'AMWALI Print Bridge - thermal printer service',
>>"%SVC_FILE%" echo   script: path.join(__dirname, '%BRIDGE_SCRIPT%'),
>>"%SVC_FILE%" echo   nodeOptions: [],
>>"%SVC_FILE%" echo   wait: 2,
>>"%SVC_FILE%" echo   grow: 0.25
>>"%SVC_FILE%" echo });
>>"%SVC_FILE%" echo svc.on('install', function(){ console.log('[install] service installed'); svc.start(); });
>>"%SVC_FILE%" echo svc.on('start',   function(){ console.log('[start] service running'); });
>>"%SVC_FILE%" echo svc.on('alreadyinstalled', function(){ console.log('[install] already installed - starting'); svc.start(); });
>>"%SVC_FILE%" echo svc.on('error',   function(e){ console.error('[error]', e); });
>>"%SVC_FILE%" echo svc.install();

set "UNSVC_FILE=%BRIDGE_DIR%\service-uninstall.js"
>"%UNSVC_FILE%" echo var Service = require('node-windows').Service;
>>"%UNSVC_FILE%" echo var path = require('path');
>>"%UNSVC_FILE%" echo var svc = new Service({
>>"%UNSVC_FILE%" echo   name: 'AmwaliPrintBridge',
>>"%UNSVC_FILE%" echo   script: path.join(__dirname, '%BRIDGE_SCRIPT%')
>>"%UNSVC_FILE%" echo });
>>"%UNSVC_FILE%" echo svc.on('uninstall', function(){ console.log('[uninstall] service removed'); });
>>"%UNSVC_FILE%" echo svc.uninstall();

echo [...] إيقاف نسخة قديمة من الخدمة (إن وُجدت) ...
sc stop "%SERVICE_NAME%" >nul 2>&1

echo [...] تثبيت الخدمة %SERVICE_NAME% ...
node "%SVC_FILE%"
if %errorLevel% NEQ 0 (
  echo [تحذير] تعذّر تثبيت الخدمة. يمكنك التشغيل اليدوي عبر start-bridge.bat
)
echo.

echo [...] انتظار 5 ثوانٍ لبدء الخدمة ...
timeout /t 5 /nobreak >nul

echo [...] فحص حالة الجسر ...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5; if ($r.status -eq 'ok') { Write-Host '[OK] الجسر يعمل بنجاح'; exit 0 } else { Write-Host '[تحذير] استجاب الجسر لكن بدون ok'; exit 1 } } catch { Write-Host '[خطأ] لم يستجب الجسر - افتح http://127.0.0.1:3001/health يدويا'; exit 1 }"
echo.

echo ============================================================
echo   انتهى التثبيت.
echo   - افتح في المتصفح:  http://127.0.0.1:3001/health
echo   - اذا ظهر  ok:true  انتقل الى اموالي واكمل التعريف.
echo   - تشغيل/ايقاف يدوي: start-bridge.bat / stop-bridge.bat
echo ============================================================
pause
endlocal