# AMWALI Print Bridge — دليل التثبيت السريع

جسر الطباعة المحلي الذي يربط نقطة بيع أموالي بالطابعات الحرارية (شبكة أو USB).
يعمل كخدمة Windows في الخلفية، ويبدأ تلقائياً مع تشغيل الجهاز.

---

## التثبيت بـ 4 خطوات

1. **فك الضغط** لكل ملفات الحزمة داخل المسار:
   ```
   C:\print-bridge
   ```
   يجب أن يحوي المجلد:
   - `print-bridge-v6.3.2.js` (أو `print-bridge.js`)
   - `install-bridge.bat`
   - باقي ملفات `start/stop/restart/health-check`
   - الشعار `logo.png` إن وُجد

2. **شغّل `install-bridge.bat` كمسؤول**
   اضغط بزر الماوس الأيمن ثم اختر **Run as administrator**.
   سيقوم تلقائياً بـ:
   - التحقق من تثبيت Node.js (وإذا غير موجود يطلب منك تثبيته من https://nodejs.org)
   - تنزيل الحزم: `express`, `sharp`, `node-windows`
   - تثبيت الخدمة `AmwaliPrintBridge` وتشغيلها
   - تشغيل الخدمة مع كل إقلاع للجهاز

3. **افتح المتصفح**:
   ```
   http://127.0.0.1:3001/health
   ```
   يجب أن ترى استجابة فيها `"status": "ok"`.

4. **انتقل إلى أموالي** وافتح:
   ```
   https://amwali.app/onboarding/new-device
   ```
   وأكمل تعريف الجهاز والطابعات.

---

## ملفات التحكم اليدوي

| الملف | الوظيفة |
|------|---------|
| `install-bridge.bat`   | تثبيت الجسر كخدمة (مرة واحدة) |
| `start-bridge.bat`     | تشغيل الخدمة |
| `stop-bridge.bat`      | إيقاف الخدمة |
| `restart-bridge.bat`   | إعادة تشغيل الخدمة |
| `health-check.bat`     | فحص حالة الجسر |
| `uninstall-bridge.bat` | إزالة الخدمة من Windows |

جميع الملفات **يجب تشغيلها كمسؤول Administrator**.

---

## استكشاف الأخطاء

- **الجسر لا يستجيب على `/health`**
  شغّل `start-bridge.bat`، ثم أعد فتح الرابط. إن فشل، شغّل `restart-bridge.bat`.

- **رسالة: Node.js غير مثبّت**
  نزّل Node.js LTS من https://nodejs.org، أعد تشغيل الجهاز، ثم أعد تشغيل `install-bridge.bat`.

- **الخدمة تعمل لكن الطابعات لا تطبع**
  افتح أموالي ثم `/device-setup` (الإعدادات المتقدمة) وجرّب طباعة اختبار. تأكد من عناوين IP للطابعات في `print-bridge-v6.3.2.js`.

- **نقل الإعدادات لجهاز جديد**
  انسخ ملف `C:\print-bridge\device.json` إلى الجهاز الجديد بعد التثبيت. هذا يحفظ الفرع/المحطة/الـ bridge URL.

---

## ملاحظات للدعم الفني

- المنفذ المستخدم: **3001** (تأكد أنه غير محجوز).
- اسم الخدمة في `services.msc`: **AmwaliPrintBridge**.
- ملفات الـ logs الخاصة بـ node-windows تكون داخل: `C:\print-bridge\daemon\`.
- لا تُغيّر API الـ bridge من جانب أموالي — التحديثات هنا فقط على ملفات التشغيل.