
# خطة إصلاح شاشة الموظف + البصمة (6 مراحل)

**النطاق:** رحلة الموظف كاملة — من فتح `/employee` → فحص الفرع → مسح QR → التقاط السيلفي → إرسال البصمة → استقبال النتيجة → تسجيل الخروج.

**خارج النطاق (ما رح نلمسه):**
- لوحة HR (`HRAttendancePage.tsx`) — سنعالجها في موديل منفصل لاحقاً.
- منطق التحقق الأمني في `attendance` edge function (لا نغيّر ترتيب الفحوصات، فقط نوازيها).
- بصمة الوجه ذاتها (`face-api.js` نموذج + استدعاء) — نغيّر طريقة التحميل فقط.
- جداول قاعدة البيانات وسياسات RLS الحرجة.

---

## مبادئ الأمان قبل التنفيذ

1. **مرحلة واحدة في كل مرة** — فحص كامل قبل الانتقال للتالية.
2. **بدون تعديل edge function `attendance` قبل المرحلة 5** — كل المراحل الأولى Frontend فقط.
3. **بدون حذف/تغيير أي استعلام أمني** — فقط تسريعه أو تجميعه.
4. **اختبار البصمة بعد كل مرحلة** — checkin + checkout + سيلفي + بدون سيلفي.

---

## المراحل التفصيلية

### 🟢 المرحلة 1 — إصلاح `usePortalAuth` (كتابة `last_login` مرة واحدة/جلسة)
**الملف:** `src/hooks/usePortalAuth.ts`
**المشكلة:** يكتب `UPDATE malaki_portal_users SET last_login` على كل mount → عشرات الكتابات/يوم/مستخدم.
**الحل:** استخدام `sessionStorage` flag بمفتاح `portal_last_login_written_<userId>` — يُكتب مرة واحدة فقط لكل جلسة تبويب.
**مخاطر البصمة:** ✅ صفر (الهوك ما إله علاقة بشاشة البصمة، لكن يخفف الضغط العام).
**التحقق:** تسجيل دخول → refresh مرتين → التأكد من عدم تكرار الكتابة.

---

### 🟢 المرحلة 2 — حذف الاستعلام المكرر في `QRScannerDialog`
**الملف:** `src/components/employee/QRScannerDialog.tsx`
**المشكلة:** استعلام `SELECT require_attendance_selfie FROM branches_safe` يعمل مرتين لنفس الفرع (سطر 81-85 + سطر 161-165).
**الحل:**
- إضافة `useRef` لتخزين نتيجة الفحص الأول مع branchId.
- في `processQR`، لو `branchId === employeeBranchId` نستخدم القيمة المخزنة.
- **fallback آمن:** لو الموظف مسح QR لفرع ثاني، الاستعلام يعمل عادي.
**مخاطر البصمة:** ✅ صفر — نفس المنطق، فقط توفير طلب شبكة.
**التحقق:** فتح ماسح → مسح QR فرعه → مسح QR فرع ثاني — كل الحالات تعمل.

---

### 🟢 المرحلة 3 — Lazy-load مكتبات ثقيلة
**الملفات:** 
- `src/components/employee/QRScannerDialog.tsx` (html5-qrcode ~100KB)
- `src/components/employee/SelfieCapture.tsx` (face-api.js ~250KB)
- `src/pages/EmployeeApp.tsx` (استيراد المكونين)

**الحل:**
- تحويل `import { Html5Qrcode } from "html5-qrcode"` إلى dynamic import داخل `startScanner()`.
- تحويل استيراد `SelfieCapture` إلى `React.lazy()` مع Suspense fallback (شاشة تحميل مصغّرة).
- (خيار) تحويل استيراد `QRScannerDialog` نفسه إلى `React.lazy` في `EmployeeApp`.

**مخاطر البصمة:** ✅ صفر — نفس السلوك، فقط تأجيل التحميل.
**المكسب:** تحميل التطبيق الأولي أخف بـ 350KB → أسرع 2-4 ثواني على شبكات 3G.
**التحقق:** فتح التطبيق (بدون فتح scanner) → تأكيد أن ملفات face-api/html5-qrcode لم تُحمّل. ثم فتح scanner → التأكد من التحميل والعمل.

---

### 🟢 المرحلة 4 — تنظيف Realtime + Effects في `EmployeeApp`
**الملف:** `src/pages/EmployeeApp.tsx`
**المشاكل:**
- الاستعلامات الأولية داخل `fetchData` عندها Promise.all ✅ (مسبقاً)، لكن استعلام السيلفي URL يحصل بعدين متسلسل.
- Realtime channel يعمل استقرار جيد ✅ (فيه debounce 350ms).
- التحقق من عدم وجود re-render loop على `sharedRoles`.

**الحل:** تدقيق فقط — لا تعديل جوهري إلا لو وجدنا مشكلة. توثيق ما نجده.
**مخاطر البصمة:** ✅ صفر.

---

### 🟡 المرحلة 5 — تحسين GPS silent-fail (المشكلة H)
**الملف:** `src/components/employee/QRScannerDialog.tsx`
**المشكلة:** العميل يرسل `latitude: 0, longitude: 0` دائماً، والـ edge function يرفض 0,0 عند الفروع اللي `require_gps !== false`.

**الحل (خيار A — الأأمن):** قبل إرسال البصمة، لو الفرع `require_gps = true`، نطلب الموقع من المتصفح ونرسله فعلياً. لو رفض المستخدم → رسالة خطأ واضحة قبل استدعاء edge function.

**الحل (خيار B):** إعدادات الفرع في UI لتعطيل `require_gps` لكل الفروع (تفضيل الأدمن) — لا نلمس كود.

**مخاطر البصمة:** 🟡 منخفض-متوسط — يغيّر تدفق قبل إرسال البصمة.
**قرار:** نسألك أي خيار قبل التنفيذ.

---

### 🟠 المرحلة 6 — Promise.all داخل edge function `attendance`
**الملف:** `supabase/functions/attendance/index.ts`
**المشكلة:** 8-12 استعلام متسلسل داخل الفنكشن، مجموعها 3-8 ثوان.

**الحل الحذر:**
- **المجموعة 1 (متوازية):** `SELECT branches` + `SELECT employees` + `SELECT employee_allowed_branches` — كلها لا تعتمد على بعضها.
- **المجموعة 2 (متوازية):** `SELECT attendance_events today` + `SELECT attendance_events 30d` + `SELECT attendance_breaks open` — بعد المجموعة 1.
- **المجموعة 3 (متتابعة كما هي):** upload selfie → insert events → insert verifications → upsert attendance_days (منطق متسلسل ضروري).

**مخاطر البصمة:** 🟡 متوسط — يحتاج اختبار شامل: checkin/checkout/break_out/break_in، مع/بدون سيلفي، مع/بدون GPS، أول بصمة/بصمة متكررة (idempotency 60s).

**قبل التنفيذ:** فحص كامل للفنكشن + قراءة الاختبارات الموجودة + خطة rollback (git revert جاهز).

---

## المراحل خارج النطاق (توصيات فقط، لن تُنفّذ الآن)

- **(A) `getUser()` overuse** — يحتاج فحص `useAuth.tsx` منفصل، وحل عام يؤثر على كل التطبيق.
- **(E) رفع السيلفي عبر signed-URL** — تغيير معماري كبير، يستحق قصة منفصلة.
- **(G) فهرس `(employee_id, break_out) WHERE break_in IS NULL`** — يُضاف عند نمو الجدول.
- **(I) تنظيف RLS المزدوجة على `attendance_events`** — أمان، ليس أداء.
- **(J) توحيد نظام كلمات المرور المزدوج** — قرار معماري.

---

## ترتيب التنفيذ المقترح

```text
اليوم:      [1] usePortalAuth  →  [2] duplicate branch query
غداً:       [3] lazy-load libraries
بعده:       [4] تدقيق EmployeeApp
لاحقاً:     [5] GPS fix (نناقش الخيارات)
أخيراً:     [6] edge function parallelization (بحذر شديد)
```

**بعد كل مرحلة:** اختبار يدوي كامل للبصمة قبل الانتقال. لو أي مرحلة كسرت شي — rollback فوري ووقفة للتحليل.

---

## سؤال قبل البدء

هل تريد التنفيذ **مرحلة-مرحلة بموافقة بعد كل واحدة**، أم **المراحل 1+2+3 دفعة واحدة** (كلها Frontend وآمنة تماماً)، ثم توقّف قبل 5 و 6؟
