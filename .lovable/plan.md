
# Hardening شامل لنظام الهوية والصلاحيات

الهدف: تحويل المشكلة من "نصلحها كل مرة" إلى **النظام يمنعها من الأساس** عبر مصدر قرار واحد + قيود DB + حراسة Backend + اختبارات + Version Gate.

---

## 1) مصدر القرار الموحّد `resolveUserAccessContext`

ملف جديد: `src/lib/accessContext.ts` يستبدل المنطق المبعثر في `useRoleRedirect` / `tenantOwnerGuard` / `Dashboard` / `ChooseWorkspacePage`.

يرجع object واحد:

```text
{
  userId, companyId, accountType, roles[], permissions[],
  isCompanyOwner, canAccessSetup, companySetupStatus,
  defaultRoute, blockingReason?
}
```

`accountType` ينحصر في: `super_admin | company_owner | company_admin | employee | sales_rep | cashier | call_center | portal_user | unlinked`.

قواعد الاستنتاج (بالترتيب، أول مطابقة تفوز):
1. `super_admin` → `super_admin`.
2. وجود سجل في `employees/pos_users/malaki_portal_users` بـ `auth_user_id = uid` نشط → النوع المقابل (employee/cashier/call_center/portal_user). **لا يصبح owner أبداً.**
3. `profiles.invited_by IS NOT NULL AND invited_by != uid` → `company_admin` (تابع لـ owner، لا يرى Setup).
4. لا روابط ولا invited_by، ويملك صفوف في `accounts` تحت `user_id = uid` → `company_owner`.
5. لا روابط ولا بيانات → `unlinked` (إذا كان أول دخول حقيقي يحق له Setup) أو حسب القاعدة 3.

`canAccessSetup = (accountType === 'company_owner') || permissions.includes('manage_company_setup')`. أي شيء آخر → false مع `blockingReason`.

useRoleRedirect / Dashboard / SetupPage / ProtectedRoute كلها تستهلك هذا الـ context فقط — لا قرارات محلية.

## 2) حراسة قاعدة البيانات (Migration آمنة، بدون فقدان بيانات)

- دالة جديدة `public.resolve_account_type(_uid uuid) returns text` (SECURITY DEFINER) تطبّق نفس المنطق على مستوى DB.
- دالة `public.user_can_access_setup(_uid uuid) returns boolean` تستخدمها `setup-accounts` edge function و RLS.
- **Trigger** على `accounts` و `companies` و أي جدول tenant-root: قبل INSERT/UPDATE، إذا `user_id` يخص سجل موجود في `employees/pos_users/malaki_portal_users` (auth_user_id) أو `profiles.invited_by NOT NULL` → ارفض مع رسالة `tenant_seed_blocked_for_subaccount`.
- **Partial unique index** يمنع وجود أكثر من owner لنفس الشركة عن طريق الخطأ (حيث `company_id` موجود).
- **CHECK / Trigger** على `employees.auth_user_id` يمنع وجود نفس الـ auth uid كـ owner و employee في نفس الوقت (يمنع double-identity).
- **لا يُحذف أي صف**. كل القيود تُضاف كـ `NOT VALID` أولاً ثم `VALIDATE` بعد فحص. أي صف مخالف موجود → يُسجّل في جدول `identity_integrity_issues` للمراجعة اليدوية بدل الرفض الصامت.

## 3) Backend (Edge Functions)

- `setup-accounts`: ينادي `user_can_access_setup(uid)` كأول سطر؛ إذا false → 403 مع `blockingReason`. لا يعتمد على أي flag من الـ frontend.
- أي function تنشئ بيانات tenant (companies / accounts / branches) تتحقق من نفس الدالة.
- إضافة structured log سطر واحد لكل قرار: `{ uid, accountType, canAccessSetup, action, allowed, reason }`.

## 4) Frontend

- `ProtectedRoute` يستهلك `accessContext` ويعرض شاشات واضحة:
  - `unlinked` → صفحة "حسابك غير مرتبط بشركة، تواصل مع الإدارة".
  - `company_setup_incomplete && !canAccessSetup` → "حساب الشركة قيد التجهيز من قِبل المالك".
- مسار `/setup`: guard مخصص `RequireSetupAccess` يعيد التوجيه إلى `defaultRoute` فوراً إذا `canAccessSetup = false` (مع toast واضح + log warning).
- `Dashboard.tsx`: حذف منطق SetupWizard inline؛ يظهر فقط داخل `/setup` المحمي.
- `useRoleRedirect`: يصبح Adapter رفيع فوق `accessContext` (يرجع `defaultRoute` من الـ context).
- إزالة كل `if (count === 0) → /setup` الموزعة.

## 5) Version Gate (Forced Update)

ملف جديد `src/lib/versionGate.ts`:
- يقرأ `BUILD_VERSION` (من vite define) و يقارنه بـ endpoint خفيف `/api/version` (أو Edge function `app-version`).
- إذا أقدم → modal إجباري "يوجد تحديث، اضغط لإعادة التحميل" يمسح SW caches + localStorage الحرج ثم `location.reload(true)`.
- يعمل قبل عرض أي شاشة auth/dashboard/setup.

## 6) اختبارات (Vitest)

ملف `src/lib/__tests__/accessContext.test.ts` يغطي:
- owner + setup incomplete → `/setup`
- owner + setup complete → `/apps`
- employee + setup incomplete → blocking screen
- employee + setup complete → `/employee`
- sales_rep / cashier / call_center / portal_user → كل واحد لا يرى Setup
- زيارة `/setup` يدوياً لـ sub-account → redirect + warning log
- unlinked user → blocking screen
- نسخة قديمة → version gate modal

## 7) Logging / Monitoring

- جدول `access_decision_logs` (اختياري، سعة محدودة) أو Console structured فقط:
  `[access] uid=... type=... defaultRoute=... canSetup=... reason=...`
- كل محاولة وصول لـ `/setup` من غير owner → `console.warn` + insert في `identity_integrity_issues`.

## 8) خطة التنفيذ التدريجية

1. Migration للقيود + الدوال الجديدة + جدول `identity_integrity_issues`.
2. تحديث `setup-accounts` edge function.
3. إنشاء `accessContext.ts` + tests.
4. إعادة كتابة `useRoleRedirect` كـ adapter + تحديث `Dashboard` / `ProtectedRoute` / `/setup` guard.
5. شاشات حالات الـ blocking.
6. Version Gate.
7. تنظيف الكود القديم المبعثر.

## معايير القبول

- مستحيل لأي employee/cashier/sales_rep/call_center/portal_user أن يرى Setup (ولو كتب الرابط يدوياً).
- مستحيل أن يصبح sub-account مالك شركة بسبب race condition.
- قرار التوجيه يصدر من مصدر واحد فقط.
- DB + Backend + Frontend ثلاثتهم يرفضون نفس الخطأ.
- Tests خضراء تغطي كل الحالات أعلاه.
- Version Gate يجبر النسخ القديمة على التحديث.
- صفر حذف بيانات. صفر كسر للحسابات الحالية.

---

**ملاحظة:** الخطة كبيرة (DB + Backend + Frontend + Tests + Version Gate). إذا توافق، أنفّذها على شكل دفعات (migration أولاً للموافقة، ثم باقي الكود).
