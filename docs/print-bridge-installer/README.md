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
   - `print-bridge-v6.3.4-generic.js`
   - `device-config-addon.js`
   - `discover-printers-addon.js`
   - `install-bridge.bat`
   - باقي ملفات `start/stop/restart/health-check`
   - الشعار `logo.png` إن وُجد

2. **شغّل `install-bridge.bat` كمسؤول**
   اضغط بزر الماوس الأيمن ثم اختر **Run as administrator**.
   سيقوم تلقائياً بـ:
   - التحقق من تثبيت Node.js. **لا حاجة لتنزيله يدوياً** — نسخة Node.js مرفقة داخل الحزمة (`node-v24.16.0-x64.msi`) وتُثبَّت تلقائياً عند الحاجة.
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

## دعم Windows 7 / Server 2008 R2

الحزمة تعمل **أوتوماتيكياً** على Windows 7 بدون أي تدخل يدوي وبدون أي تعديل على ملف البريدج (`print-bridge-v6.3.6-clean.js`).

عند تشغيل `install-bridge.bat` كمسؤول على Win7، يقوم المثبّت تلقائياً بـ:

1. **كشف نسخة ويندوز** (`ver | findstr 6.1`) → يُفعّل المسار القديم.
2. **تفعيل TLS 1.2** في PowerShell — لأن Win7 افتراضياً TLS 1.0 وهذا يكسر كل تحميل من npm و nodejs.org (هذه السبب الجذري لرسالة `The underlying connection was closed`).
3. **استخدام Node.js v13.14.0** المُرفقة في `node-v13.14.0-x64.msi` (آخر إصدار يدعم Win7). إذا لم تكن مرفقة يحاول تنزيلها من `https://nodejs.org/dist/v13.14.0/`.
4. **تثبيت `sharp@0.30.7`** على Win7 بدلاً من 0.33.x — هذا الإصدار يدعم Node 13 (الإصدارات الأحدث تتطلب Node ≥ 14.15) وعنده prebuilt binaries عبر Node-API، فلا حاجة لـ node-gyp ولا Python ولا Visual Studio Build Tools ولا Chocolatey. على Win10/11 يبقى `sharp@0.32.6` من `package.json`.
5. ضبط `npm config` لاستخدام TLS 1.2 ومرايا GitHub الرسمية لـ sharp + libvips.

### لو فشل التثبيت على Win7

شغّل `check-windows.bat` للحصول على تشخيص فوري:
- نسخة ويندوز
- نسخة Node و npm المثبتة
- هل TLS 1.2 متاح
- هل `node_modules\sharp\build\Release\*.node` موجود (مؤشر نجاح/فشل sharp)
- هل الخدمة شغّالة على `127.0.0.1:3001`

### الأخطاء الشائعة على Win7 وحلولها

| الخطأ | السبب | الحل |
|---|---|---|
| `choco is not recognized` + `DownloadString ... underlying connection was closed` | Node 24/20 لا يعمل على Win7 → فُرض على المستخدم تنزيل Node قديم → ثم `sharp 0.33` حاول البناء من المصدر → node-gyp استدعى Chocolatey → فشل لأن TLS 1.0 | استخدم `install-bridge.bat` الجديد (يستعمل sharp 0.32.6 prebuilt + TLS 1.2 تلقائياً) |
| `node is not recognized` بعد التثبيت | متغير PATH لم يُحدّث في نفس الجلسة | أغلق CMD وافتحه من جديد ثم شغّل `install-bridge.bat` |
| `sharp.node not found` | فشل تنزيل prebuilt من GitHub | تأكد من اتصال الإنترنت ثم: `cd C:\print-bridge && npm rebuild sharp` |

> ⚠️ مهم: لا تشغّل `npm install` يدوياً على Win7 قبل ما تشغّل `install-bridge.bat` — لأنه لن يضبط TLS 1.2 ولن يفرض sharp 0.32.6 وستحصل على نفس الخطأ.

---

## حل احتياطي: التشغيل عبر Startup (في حال فشل تثبيت الخدمة)

الطريقة الأساسية والمفضّلة هي **Windows Service** عبر `install-bridge.bat`.
استخدم هذا الحل **فقط** إذا فشل تثبيت الخدمة لأي سبب.

### الخيار 1: تلقائي
شغّل `install-startup-fallback.bat` بنقرة مزدوجة. سيقوم بإنشاء اختصار
لـ `start-bridge-hidden.vbs` داخل مجلد Startup للمستخدم الحالي، ويشغّل الجسر فوراً بدون نافذة.

### الخيار 2: يدوي
1. اضغط `Win + R`.
2. اكتب `shell:startup` واضغط Enter.
3. ضع اختصاراً لملف `C:\print-bridge\start-bridge-hidden.vbs` داخل المجلد المفتوح.

الجسر سيعمل تلقائياً عند تسجيل دخول المستخدم، وبدون نافذة CMD ظاهرة.

> ⚠️ ملاحظة: هذا الحل يعمل فقط بعد تسجيل دخول المستخدم، بعكس الخدمة التي تعمل
> قبل تسجيل الدخول مباشرة بعد إقلاع Windows.

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
  المُثبِّت يحتوي Node.js مرفقاً (`node-v24.16.0-x64.msi`) ويثبّته تلقائياً.
  إذا ظهرت هذه الرسالة، تأكد أن ملف `node-v*-x64.msi` موجود داخل `C:\print-bridge`،
  ثم أعد تشغيل `install-bridge.bat` كمسؤول. كحل بديل، ثبّت Node.js LTS يدوياً
  من https://nodejs.org ثم أعد المحاولة.

- **الخدمة تعمل لكن الطابعات لا تطبع**
  افتح أموالي → `/onboarding/new-device` → خطوة الطابعات، عدّل الـ IPات أو استخدم زر "البحث عن طابعات الشبكة"، ثم اضغط حفظ. التغييرات تُحفظ في `C:\print-bridge\device.json` وتُطبَّق فوراً (بدون تعديل JS).

- **نقل الإعدادات لجهاز جديد**
  انسخ ملف `C:\print-bridge\device.json` إلى الجهاز الجديد بعد التثبيت. هذا يحفظ الفرع/المحطة/الـ bridge URL.

---

## ملاحظات للدعم الفني

- المنفذ المستخدم: **3001** (تأكد أنه غير محجوز).
- اسم الخدمة في `services.msc`: **AmwaliPrintBridge**.
- ملفات الـ logs الخاصة بـ node-windows تكون داخل: `C:\print-bridge\daemon\`.
- لا تُغيّر API الـ bridge من جانب أموالي — التحديثات هنا فقط على ملفات التشغيل.