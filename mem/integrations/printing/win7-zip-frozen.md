---
name: Windows 7 Print Bridge ZIP — Frozen
description: ZIP منفصل لـ Win7 مجمّد، لا يُحدّث إلا بطلب صريح من المستخدم
type: constraint
---

# قاعدة دائمة: ZIP Win7 منفصل ومجمّد

## الملف المجمّد
- المسار: `public/downloads/amwali-print-bridge-win7.zip`
- النسخة الحالية: v6.3.7-clean (مُختبر) + Node 13.14.0 MSI مضمّن
- URL في الواجهة: `PRINT_BRIDGE_WIN7_DOWNLOAD_URL` في `src/pages/NewDeviceOnboardingPage.tsx`

## ممنوع تماماً
- ❌ تحديث `amwali-print-bridge-win7.zip` بشكل تلقائي عند أي تعديل على print-bridge.
- ❌ ترقية v6.3.7 إلى v6.3.8 أو أحدث داخل ZIP Win7 بدون طلب صريح.
- ❌ إضافة `node-v24-x64.msi` أو أي Node ≥14 داخل ZIP Win7 (Win7 لا يدعمها).
- ❌ دمج ZIP Win7 مع ZIP العادي.
- ❌ تغيير cache-buster `?v=...` لـ Win7 URL إلا عند تحديث فعلي مُعتمد للـ ZIP.

## مسموح فقط بطلب صريح من المستخدم
- إعادة بناء ZIP Win7 بنسخة جديدة (لازم يقول "حدّث ZIP Win7" أو ما يماثلها).
- تغيير قائمة الملفات الداخلية.
- ترقية Node داخل ZIP Win7.

## ZIP العادي (Win10/11) منفصل تماماً
- المسار: `public/downloads/amwali-print-bridge.zip`
- يستمر تحديثه عادي عند أي تعديل على print-bridge — لا علاقة له بـ ZIP Win7.

## آلية إعادة بناء ZIP Win7 (للمرجع فقط — لا تنفّذ تلقائياً)
```bash
STAGE=/tmp/win7-stage
rm -rf "$STAGE" && mkdir -p "$STAGE/amwali-print-bridge"
cd docs/print-bridge-installer
cp install-bridge-win7.bat install-bridge.bat start-bridge-win7.bat start-bridge.bat \
   stop-bridge.bat restart-bridge.bat uninstall-bridge.bat diagnose-win7.bat \
   health-check.bat health-check.vbs check-windows.bat install-startup-fallback.bat \
   start-bridge-hidden.vbs service-install.js service-uninstall.js \
   device-config-addon.js discover-printers-addon.js package.json \
   print-bridge-v6.3.7-clean.js node-v13.14.0-x64.msi \
   README-WINDOWS7.txt README.md NETWORK-DISCOVERY.md PRINTERS-FROM-DEVICE-JSON.md \
   "$STAGE/amwali-print-bridge/"
cd "$STAGE" && zip -r /dev-server/public/downloads/amwali-print-bridge-win7.zip amwali-print-bridge
```
لاحظ: لا يحتوي على `node-v24-x64.msi` ولا على `v6.3.6` ولا `v6.3.8`.