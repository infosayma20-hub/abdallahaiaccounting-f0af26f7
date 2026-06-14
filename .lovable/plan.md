
# خطة احترافية لإصلاح نظام تسجيل الخروج التلقائي

## الهدف

نظام انتهاء جلسة موحّد، آمن، ومدقَّق، يعمل بنفس الدقة في كل أجزاء البرنامج (لوحة الأدمن، بوابات الموظف/البائع/المالك، Super Admin، Store Tracker)، ويحترم إعدادات صاحب الشركة، ويتزامن بين كل تبويبات المتصفح، ويُسجَّل في سجل التدقيق.

---

## المرحلة 1 — إعادة هيكلة المنطق (Core)

### 1.1 إنشاء `useIdleLogout` Hook موحّد
ملف جديد: `src/hooks/useIdleLogout.ts`

- مصدر حقيقة واحد للنشاط: timestamp `lastActivityAt` (Date.now) في ref + localStorage مفتاحه `amwali_last_activity:<user_id>`.
- يقرأ الإعدادات من جدول `companies` (وليس `company_settings` الشخصي) عبر RPC جديدة `get_effective_session_policy` تُرجع `{timeout_minutes, warning_minutes}` بناءً على شركة المستخدم → يُحلّ مشكلة "إعداد المالك لا يصل لموظفيه".
- مؤقت تحقّق دوري (`setInterval` كل 15 ثانية) يقارن `Date.now() - lastActivityAt` بالـ timeout، بدل الاعتماد على `setTimeout` طويل (يحلّ مشاكل sleep/wake وبرامج الـ background throttling).
- يستمع لأحداث: `mousedown`, `keydown`, `scroll`, `touchstart`, `click` (إزالة `mousemove`/`pointermove` المزدوجين — `mousedown` يكفي لاكتشاف النشاط الفعلي).
- listener على `visibilitychange` و`focus` لتنفيذ فحص فوري عند العودة للتبويب.

### 1.2 مزامنة النشاط عبر التبويبات (BroadcastChannel)
- استخدام القناة الموجودة `malaky-sync` (per Memory: Cross Tab Sync).
- كل نشاط محلي → debounced postMessage كل 5 ثوانٍ: `{type:"session_activity", userId, ts}`.
- المستلمون يحدّثون `lastActivityAt` المحلي بدون reset مزيف.
- نتيجة: نشاط في أي تبويب يحفظ كل التبويبات من الخروج التلقائي.

### 1.3 خروج موحّد مدقَّق
ملف جديد: `src/lib/sessionLogout.ts` يُصدّر دالة `performSessionTimeout()`:

1. يستدعي `useAuth().signOut()` المُغلّف (وليس `supabase.auth.signOut` مباشرة) → يضمن audit log، تنظيف drafts، إطلاق refresh leadership.
2. يُسجّل قبل الخروج حدث `session_timeout` في `log-security-event` Edge Function (يميّز عن `logout` اليدوي و`session_expired` التلقائي من الخادم).
3. يمسح كل `sb-*`, `supabase.*`, `amwali_draft_*`, `workspace-choice:*`, `amwali_last_activity:*`.
4. يُرسل عبر BroadcastChannel `{type:"session_force_logout", userId, reason:"timeout"}` ⟶ كل التبويبات الأخرى تُنفّذ نفس الخروج فوراً.
5. `window.location.replace("/auth?reason=session_timeout")` (reason مختلف عن `session_expired` ليُفرَّق في الـ Banner).

---

## المرحلة 2 — قاعدة البيانات

### 2.1 ترقية مكان الإعداد إلى مستوى الشركة
نقل `security_session_timeout` و`security_warning_minutes` من `company_settings` (per-user) إلى جدول `companies`:

- migration: إضافة عمودين `session_timeout_minutes int default 30`, `session_warning_minutes int default 2` على `companies`.
- ترحيل القيم الحالية من `company_settings` (صف المالك فقط) إلى `companies.*` لكل شركة.
- إبقاء العمودين القديمين في `company_settings` لفترة انتقالية مع تعليق `DEPRECATED`.

### 2.2 RPC موحّدة
دالة `get_effective_session_policy(_uid uuid)` SECURITY DEFINER:
- تستخرج `company_id` من `accounts` (للمالك) أو `employees.created_by` (للموظف الفرعي) عبر منطق DataOwnerId الموجود.
- تُرجع `(timeout_minutes, warning_minutes)` من جدول `companies`.
- fallback: `(30, 2)` للحسابات غير المرتبطة.
- `GRANT EXECUTE ... TO authenticated`.

### 2.3 توسيع audit
إضافة نوع حدث `session_timeout` لـ Edge Function `log-security-event` (إن لم يكن موجوداً) — تأكيد فقط.

---

## المرحلة 3 — التغطية الشاملة لكل البوابات

نقل `<SessionManager />` (سيُعاد تسميته `<IdleLogoutGuard />`) من `WebLayout` إلى مستوى أعلى في `App.tsx` تحت شرط `if (user && !isPOSRoute)`:

| البوابة | الحالة الحالية | بعد الإصلاح |
|---|---|---|
| لوحة الأدمن (WebLayout) | ✅ مغطّى | ✅ |
| `/portal/*` (Portal users) | ❌ | ✅ |
| `/employee` (Employee Portal) | ❌ | ✅ |
| `/rep/*` (Sales Reps) | ❌ | ✅ |
| `/super-admin/*` | ❌ | ✅ (timeout أقصر 15د لحساسية الصلاحية) |
| `/store-tracker` | ❌ | ✅ |
| `/pos` و`/pos/*` | ❌ (مقصود) | ❌ يبقى مستثنى — POS له shift lifecycle مختلف |
| `/auth`, `/setup`, `/blocked/*` | ❌ | ❌ (لا معنى لها بدون user) |

استثناء POS عبر `useLocation` داخل المكوّن.

---

## المرحلة 4 — تحسينات UX وحماية

### 4.1 شاشة التحذير
- إبقاء شاشة "هل لا تزال هنا؟" مع العدّاد قبل دقيقتين.
- زر "ابقَ" → ينشر `session_activity` على BroadcastChannel ⟶ يُجدِّد كل التبويبات.
- تحذير صوتي خفيف اختياري (يُعطَّل افتراضياً).

### 4.2 شاشة القفل الميتة
حذف شاشة القفل الداخلية (lines 243-282) من `SessionManager` نهائياً — الـ redirect إلى `/auth?reason=session_timeout` هو المسار الفعلي، وتعديل `AuthPage` لعرض banner مختلف:
- `reason=session_expired` → "انتهت فترة تصفحك للبرنامج" (أصفر)
- `reason=session_timeout` → "تم تسجيل خروجك تلقائياً بعد X دقيقة من عدم النشاط لحماية بياناتك" (أزرق informational)

### 4.3 تخزين مرتبط بالمستخدم
- مفتاح `amwali_last_activity:<user_id>` (بدلاً من المفتاح العام).
- عند `SIGNED_IN` لمستخدم جديد ⟶ مسح كل مفاتيح `amwali_last_activity:*` للمستخدمين السابقين.
- يحلّ مشكلة تسرّب إعداد المستخدم السابق.

### 4.4 صفحة الإعدادات
- `SecuritySettingsSection`: تنبيه واضح "هذا الإعداد يطبَّق على كل موظفي الشركة".
- حفظ القيمة في `companies` (عبر RPC `update_company_session_policy`) بدل `company_settings`.
- إزالة `dispatchEvent("session_settings_updated")` من نفس التبويب — الـ Realtime على `companies` يُحدّث جميع التبويبات والأجهزة.
- اشتراك Realtime على صف `companies` للمستخدم ⟶ تغيير الإعداد يصل لكل الجلسات المفتوحة فوراً.

---

## المرحلة 5 — حماية من التلاعب (Server-Side Enforcement)

نقطة P3 في تقرير الـ QA: التحكّم محلي 100%. الحلّ:

### 5.1 Server-side last-activity tracking
- إضافة عمود `last_activity_at timestamptz` على `profiles`.
- Edge Function خفيفة `ping-activity` تُحدّث `profiles.last_activity_at = now()` كل 60 ثانية أثناء النشاط.
- Edge Function `enforce-session-policy` يستدعيها العميل عند العودة للتبويب (`visibilitychange`) → ترجع `{should_logout: true/false}` بناءً على `now() - last_activity_at > timeout_minutes` من `companies`.
- إذا `should_logout=true` → العميل يُنفّذ `performSessionTimeout()` فوراً.
- هذا يمنع المستخدم التقني من تعطيل المؤقت محلياً عبر DevTools.

### 5.2 (اختياري لاحقاً — خارج هذه الخطة)
- إبطال refresh_token من جانب الخادم عبر admin API بعد timeout. يحتاج Edge Function مع service_role + cron. مرحلة منفصلة.

---

## المرحلة 6 — اختبار وقبول (Acceptance Tests)

ينفّذ المستخدم يدوياً (بعد إخباري بنتيجة كل سيناريو):

| # | السيناريو | التوقّع |
|---|---|---|
| T1 | فتح لوحة الأدمن، عدم نشاط 30د | تحذير دقيقة 28، خروج دقيقة 30 |
| T2 | نشاط في الدقيقة 29 | reset كامل |
| T3 | تبويبين مفتوحين، نشاط في A فقط | B لا يقفل، يبقى الاثنان |
| T4 | تبويبين، خروج تلقائي في أحدهما | الثاني يقفل فوراً عبر BroadcastChannel |
| T5 | بوابة الموظف (`/employee`) 30د خمول | خروج تلقائي + banner أزرق |
| T6 | مالك يغيّر الإعداد لـ 60د من تبويب آخر | كل التبويبات تتحدّث Realtime |
| T7 | موظف فرعي يدخل بعد تغيير المالك | يحصل 60د (وليس 30 الافتراضي) |
| T8 | DevTools: تعطيل `setInterval` يدوياً | الخادم يكتشف عند `visibilitychange` ويُجبر خروج |
| T9 | فحص `user_security_audit` بعد خروج تلقائي | يوجد صف `event_type=session_timeout` |
| T10 | POS مفتوح 60د بدون نشاط | لا يحصل خروج (مقصود) |
| T11 | إغلاق لابتوب 5 ساعات وفتحه | خروج فوري عند الفتح |
| T12 | مستخدم A خرج، مستخدم B دخل نفس المتصفح | B يحصل إعداد شركته فوراً، لا يرث إعداد A |

---

## المرحلة 7 — توثيق وذاكرة

- إنشاء مذكّرة `mem://features/auth/idle-logout-system-v1` تشمل:
  - بنية الـ hook والـ BroadcastChannel
  - مصدر الإعداد في `companies`
  - أنواع الخروج الثلاثة: manual / session_expired / session_timeout
  - استثناء POS
- تحديث `mem://index.md` بإضافة المرجع.

---

## ملفات ستتأثّر (جرد كامل)

**جديدة:**
- `src/hooks/useIdleLogout.ts`
- `src/lib/sessionLogout.ts`
- `src/components/IdleLogoutGuard.tsx` (يستبدل `SessionManager.tsx`)
- `supabase/migrations/<ts>_session_policy_to_companies.sql`
- `supabase/migrations/<ts>_session_policy_rpcs.sql`
- `supabase/functions/ping-activity/index.ts`
- `supabase/functions/enforce-session-policy/index.ts`
- `mem://features/auth/idle-logout-system-v1`

**تعديلات:**
- `src/components/SessionManager.tsx` → حذف
- `src/components/layout/WebLayout.tsx` → إزالة `<SessionManager />`
- `src/App.tsx` → إضافة `<IdleLogoutGuard />` بعد `<AuthProvider>`
- `src/pages/AuthPage.tsx` → banner ثاني لـ `reason=session_timeout`
- `src/components/settings/SecuritySettingsSection.tsx` → تحديث المصدر + Realtime
- `src/hooks/useCompanySettings.ts` → إضافة `companies.session_*` (للقراءة فقط)
- `supabase/functions/log-security-event/index.ts` → قبول `session_timeout`

---

## ترتيب التنفيذ (Sequencing)

```text
Migration DB ─┬─> RPC get_effective_session_policy
              └─> RPC update_company_session_policy
                  │
                  ├─> Edge: log-security-event (+ session_timeout)
                  ├─> Edge: ping-activity
                  └─> Edge: enforce-session-policy
                       │
                       └─> useIdleLogout + sessionLogout + BroadcastChannel
                            │
                            ├─> IdleLogoutGuard component
                            ├─> Mount in App.tsx (exclude POS)
                            ├─> AuthPage banner update
                            └─> SecuritySettingsSection refactor
                                 │
                                 └─> حذف SessionManager.tsx
                                      │
                                      └─> Smoke Tests T1-T12
```

كل مرحلة لا تبدأ قبل اعتماد سابقتها. لا أمسّ POS، ولا أعدّل في النظام المالي/المحاسبي.

---

## ما لن يُلمس (Out of Scope)

- POS Shift lifecycle و6 AM cutoff (مقصود استثناؤها)
- منطق RLS الحالي على الجداول المالية
- نظام `useAuth` الأساسي (التغيير فقط: نستخدم `signOut()` بدل المباشر)
- معالجة 401/JWT في `accessContext.ts` (تمّ سابقاً)

---

## ملاحظة للموافقة

الخطة طويلة ومدروسة ومتعدّدة المراحل (migrations + Edge Functions + Frontend refactor). نفّذها مرحلة-مرحلة، ولن أبدأ المرحلة التالية قبل أن تؤكّد نجاح السابقة. وافق بكتابة "ابدأ المرحلة 1" أو طلب تعديلات قبل البدء.
