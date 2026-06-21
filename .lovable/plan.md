## خطة شاملة: منع ومعالجة جلسات الكاشير المتزامنة على نفس الحساب

### المشكلة
نفس حساب الكاشير (pos_users) إذا فُتح على جهازين بنفس الوقت → الإثنين بيشتغلوا على نفس `pos_session` المفتوحة، وبيصير:
- **Lost Update** على `total_sales`/`total_orders` → فرق صندوق وهمي عند الإغلاق
- إذا أغلق جهاز العهدة، جهاز ثاني عنده طلبات Offline في الـ IndexedDB → بتروح Quarantine
- صندوق النقدية (`cash_boxes`) بدون أي قفل → حركات نقدية متزامنة بدون رقابة
- `pos_user_device_access` موجود بالـ DB بس مش مفعّل بالكود
- الـ Heartbeat معطّل بالكامل في `POSDeviceAuthGuard`

---

### المبدأ الحاكم
**جلسة كاشير واحدة نشطة على جهاز واحد فقط لكل `pos_user`.** أي محاولة فتح ثانية لازم:
1. تُمنع تلقائياً، أو
2. تطلب من المستخدم "نقل الجلسة لهذا الجهاز" (مع إخراج الجهاز الأول بشكل آمن).

نفس المبدأ بنطبّقه على مستويين: **قاعدة البيانات** (الحقيقة المطلقة) + **الواجهة** (تجربة سلسة).

---

### المراحل

#### المرحلة 1 — تحصين قاعدة البيانات (الأساس)
**1.1 ربط الجلسة بجهاز واحد (DB-level lock)**
- التأكيد على `pos_sessions_one_open_per_cashier` (موجود) — يمنع جلستين مفتوحتين لنفس `cashier_auth_user_id`.
- إضافة عمود `active_device_id` و`active_device_fingerprint` و`last_heartbeat_at` على `pos_sessions`.
- منع تعديل `total_sales/total_orders` مباشرة من العميل: تحويلها لـ RPC `increment_pos_session_totals(session_id, sales_delta, orders_delta)` (atomic UPDATE) → يحل مشكلة Lost Update جذرياً.

**1.2 RPC جديدة `claim_pos_session(session_id, device_id, fingerprint)`**
- تتحقق إذا الجلسة مفتوحة على جهاز ثاني نشط خلال آخر 60 ثانية.
- إذا نعم → ترجع `{conflict: true, other_device, last_seen}`.
- إذا لا → تحجز الجلسة لهذا الجهاز (UPDATE atomic مع `WHERE active_device_id IS NULL OR last_heartbeat_at < now() - interval '60s'`).

**1.3 RPC `heartbeat_pos_session(session_id, device_id)`**
- تحدّث `last_heartbeat_at` كل 15 ثانية فقط للجهاز المالك.
- إذا الجهاز مش المالك → ترجع `revoked: true` → الواجهة تحوّل لـ View-Only فوراً.

**1.4 تفعيل `pos_user_device_access` على مستوى DB**
- Trigger على `pos_sessions INSERT`: يرفض إذا الـ pos_user مقيّد بأجهزة معينة والجهاز الحالي مش منهم.

**1.5 حماية الصندوق `cash_boxes`**
- إضافة `current_session_id` + `locked_by_device_id` + trigger يمنع حركات نقدية من جهاز غير المالك للجلسة الحالية.

#### المرحلة 2 — تحصين الواجهة
**2.1 Fingerprint للجهاز**
- توليد `device_fingerprint` ثابت لكل متصفح/جهاز (مخزّن في localStorage + مرتبط بـ Print Bridge MAC إذا متاح).

**2.2 إعادة تفعيل Heartbeat بشكل آمن في `POSDeviceAuthGuard`**
- استدعاء `heartbeat_pos_session` كل 15s.
- لو رجع `revoked` → عرض Dialog "تم نقل الجلسة لجهاز آخر" + تحويل View-Only + حفظ السلة في `pos-blocked-cart-draft` (موجودة).

**2.3 سلوك تسجيل الدخول الذكي**
- عند فتح الـ POS وإيجاد جلسة مفتوحة على جهاز آخر نشط:
  - عرض Dialog: **"الجلسة مفتوحة على جهاز [اسم الجهاز] منذ [الوقت]. هل تريد نقلها لهذا الجهاز؟"**
  - زر "نقل الجلسة" → يستدعي `claim_pos_session` بـ `force=true` → الجهاز القديم يستلم Revoked فوراً عبر heartbeat.
  - زر "إلغاء" → يرجع لشاشة اختيار الموظف.

**2.4 إصلاح تحديث `total_sales`/`total_orders`**
- استبدال كل `UPDATE pos_sessions SET total_sales = X` بنداء `increment_pos_session_totals` (لمنع Lost Update حتى لو نجح أحد بفتح جلستين بشكل ما).

**2.5 حماية الـ Offline Queue**
- في `sync_offline_pos_sale`: التحقق من أن الجلسة المرجعية ما زالت `open`. إذا مغلقة → الطلب يدخل Quarantine مع رسالة واضحة + خيار "إعادة الإسناد لجلسة جديدة".

#### المرحلة 3 — الكشف عن الانتهاكات التاريخية
**3.1 تقرير Super Admin: "الجلسات المتعارضة"**
- صفحة جديدة تعرض الجلسات اللي صار عليها نشاط من أكثر من Device fingerprint (تحليل `pos_audit_log`).
- إنذار للشركات اللي عندها هاد النمط بكثرة.

**3.2 Audit جديد**
- كل `claim_pos_session` مع `force=true` يُسجّل في `pos_sensitive_actions_log`.

#### المرحلة 4 — توعية المستخدم (UX)
- في Dialog نقل الجلسة، رسالة واضحة بالعربية:
  > "تم اكتشاف أن نفس حساب الكاشير مفتوح على جهاز آخر. لحماية أرصدة الصندوق، يُسمح بجهاز واحد فقط في كل وقت. الموصى به: إنشاء حساب منفصل لكل كاشير من إعدادات نقاط البيع."
- زر مباشر "إنشاء حساب كاشير جديد" (للأدمن فقط).

---

### الجدول الزمني المقترح (تنفيذ متدرّج)
| Phase | الزمن | الأثر | المخاطرة |
|---|---|---|---|
| 1.1 + 2.4 (Lost Update fix) | فوري | يحل أخطر مشكلة (فرق الصندوق) | منخفضة جداً |
| 1.2 + 1.3 + 2.1 + 2.2 + 2.3 (Device claim + Heartbeat) | المرحلة الثانية | يمنع التشغيل المتزامن نهائياً | متوسطة — يتطلب اختبار جيد للـ Bridge dropouts |
| 1.4 + 1.5 (DB Triggers) | المرحلة الثالثة | حماية شاملة حتى من العملاء القدامى | منخفضة |
| 2.5 + المرحلة 3 (Offline + Audit) | المرحلة الرابعة | تنظيف وكشف | منخفضة |

---

### معايير القبول
- ✅ مستحيل تقنياً وجود جلستين نشطتين لنفس `cashier_auth_user_id`.
- ✅ `total_sales` و`total_orders` دقيقة 100% حتى تحت ضغط متزامن (اختبار بـ pgbench).
- ✅ Bridge Dropout لا يطرد الكاشير (الـ heartbeat يميّز بين "جهاز ثاني سرق الجلسة" و"شبكة سيئة").
- ✅ الطلبات Offline ما تروح Quarantine بسبب إغلاق جلسة من جهاز ثاني (يتم إعادة إسنادها).
- ✅ كل محاولة نقل جلسة مسجّلة في Audit Log.

---

### المخاطر والتخفيف
| المخاطرة | التخفيف |
|---|---|
| Bridge بطيء يسبب revoke خاطئ | tolerance: 3 heartbeats متتالية فاشلة قبل revoke (45s) |
| العميل بدّل الكمبيوتر فعلاً ومحتاج ينقل بسرعة | زر "نقل الجلسة" واضح ومباشر بـ click واحد |
| Lost Updates تاريخية | سكريبت تصحيح once-off يعيد حساب `total_sales` من `pos_orders` لكل جلسة مغلقة |
| كسر الـ Offline Mode | الـ RPC الجديدة `sync_offline_pos_sale` تتعامل مع الحالة |

---

### ما لن يتغيّر (Out of scope)
- Call Center (مش متأثر — لا عهدة ولا طباعة محلية)
- منطق الدفع/المحاسبة/الـ GL
- الـ POS UI الرئيسي (بس Dialogs جديدة)
- صلاحيات الأدوار (RBAC)

---

هل تعتمد الخطة بكامل مراحلها، أو تحب نبدأ بالمرحلة 1.1 + 2.4 فقط (إصلاح Lost Update فوراً) كأول دفعة آمنة؟