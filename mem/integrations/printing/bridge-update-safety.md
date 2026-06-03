---
name: Print Bridge Update Safety
description: قواعد دائمة لأي تحديث على print-bridge — لا نمسح device.json ولا الطابعات أبداً
type: constraint
---

# قاعدة دائمة: تحديث print-bridge يجب ألا يمس إعدادات الجهاز

## ما يجب الحفاظ عليه دائماً
- `C:\print-bridge\device.json` (يحتوي branchId/terminalId/label/bridgeUrl/printers/cashBoxId)
- `C:\print-bridge\device.json.bak` (نسخة احتياطية تلقائية)
- `C:\print-bridge\logo.png` (إن وُجد — اختياري)

## آليات الحماية المطبّقة (لا تُزال)
1. **`install-bridge.bat`**:
   - يصنع `device.json.bak` من `device.json` قبل أي تحديث.
   - بعد التركيب، إذا اختفى `device.json` يسترجعه من `.bak` ويستدعي `/reload-config`.
2. **`device-config-addon.js`** (self-heal):
   - عند الإقلاع إذا `device.json` مفقود و`.bak` موجود → ينسخه تلقائياً قبل القراءة.
   - كل عملية `write()` تكتب `.bak` مرافقة على نفس اللحظة.
3. **ZIP لا يحتوي `device.json` أبداً** — لا نشحنه ولا نكتبه فوقه.
4. **الواجهة `/onboarding/new-device`** تميّز 3 حالات:
   - 🔴 غير متصل (bridge غير شغّال)
   - 🟡 متصل — غير مربوط بفرع (`device.branchId/terminalId` null)
   - 🟢 متصل ومربوط

## ممنوع في أي تعديل مستقبلي
- ❌ شحن `device.json` داخل ZIP (يدمّر إعدادات الفرع).
- ❌ حذف `device.json` أو `device.json.bak` في install/uninstall/start/restart scripts.
- ❌ تعديل `install-bridge.bat` بحيث ينسخ مجلد كامل فوق `C:\print-bridge` بدون استثناء `device.json*`.
- ❌ تغيير `device-config-addon.js` بحيث `write()` لا تُحدّث `.bak`.
- ❌ إزالة استدعاء `/reload-config` بعد استرجاع `.bak`.
- ❌ إعادة عرض "غير متصل" (أحمر) عندما الـ bridge شغّال فعلاً — يجب "غير مربوط" (أصفر).

## بروتوكول إصدار نسخة جديدة من print-bridge
1. حدّث ملف `print-bridge-vX.Y.Z-clean.js` (لا تحذف القديم — أضف candidate جديد في `service-install.js`).
2. تأكد أن `install-bridge.bat` يحتوي بلوكَي backup+restore الخاصَّين بـ `device.json`.
3. أعد بناء ZIP بدون `device.json` ومع `device-config-addon.js` المحدّث.
4. غيّر cache-buster في `src/pages/NewDeviceOnboardingPage.tsx` (`PRINT_BRIDGE_DOWNLOAD_URL`).
5. اختبر يدوياً: ضع `device.json` تجريبي → نزّل ZIP → شغّل install → تحقق أن `device.json` لم يتغيّر و`.bak` موجود.

## الملفات المرجعية
- `docs/print-bridge-installer/install-bridge.bat`
- `docs/print-bridge-installer/device-config-addon.js`
- `docs/print-bridge-installer/print-bridge-v6.3.6-clean.js`
- `src/pages/NewDeviceOnboardingPage.tsx` (شريط الحالة + cache-buster)

## توصية للمستخدم النهائي
بعد ربط جهاز فرع لأول مرة، انسخ `C:\print-bridge\device.json` على USB كاحتياط نهائي.
