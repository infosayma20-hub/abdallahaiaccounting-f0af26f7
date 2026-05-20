# صلاحيات التطبيقات لكل مستخدم — User App Access Overrides

## الهدف
السماح للأدمن بفتح/إغلاق تطبيقات معينة لكل مستخدم على حدة دون تغيير دوره، مع تطبيق الصلاحيات في كل من قائمة التطبيقات والقائمة الجانبية وحماية المسارات.

## 1) قاعدة البيانات (Migration)

جدول جديد:
```text
user_app_access_overrides
  id              uuid PK
  owner_id        uuid  -- صاحب الشركة (لتسريع RLS)
  company_id      uuid  -- شركة المستخدم
  target_user_id  uuid  -- المستخدم المتأثر
  app_key         text  -- مثل: sales / pos / hr ...
  access_state    text check in ('inherit','allow','deny')
  created_by      uuid
  created_at      timestamptz
  updated_at      timestamptz
  UNIQUE (target_user_id, app_key)
```

**RLS:**
- SELECT: للأدمن إذا `target_user_id` تابع لنفس company_id أو دعاه (`invited_by`)، وللمستخدم نفسه لقراءة overrides الخاصة به فقط.
- INSERT/UPDATE/DELETE: للأدمن فقط، بشرط نفس الشركة/الدعوة. لا يمكن للمستخدم تعديل صلاحياته.
- يتم التحقق من company_id/invited_by عبر دالة `public.is_same_company_user(_target uuid)` `SECURITY DEFINER` لتفادي recursion.

**Trigger:**
- `BEFORE INSERT/UPDATE`: يملأ company_id و owner_id تلقائياً من profile الـ target.
- `AFTER INSERT/UPDATE/DELETE`: يكتب صفاً في `activity_log` بـ `action='update_user_app_access'` ويحتوي `target_user_id`, `app_key`, old/new state.

## 2) Edge Function (`manage-user-app-access`)

عمليات: `list`, `upsert`, `reset` (حذف override واحد أو الكل لمستخدم).

تحقق على السيرفر:
- يقرأ profile الـ target.
- يسمح فقط لو: super_admin، أو `target.company_id = admin.company_id`، أو `target.invited_by = admin.id`، أو `target = admin` (للقراءة فقط).
- خلاف ذلك → **403 Cross-tenant forbidden** + سطر `reset_user_app_access_denied` في activity_log.

> ملاحظة: الـ RLS كافٍ نظرياً لكن الـ edge function يوفّر رسالة 403 واضحة + audit موحّد + قراءة بدون تسريب.

## 3) واجهة الإدارة

في `src/components/settings/UsersSettingsSection.tsx`:
- زر جديد لكل صف: **"إدارة التطبيقات"** يفتح Dialog.
- عمود ملخص: "مخصص: ✓3 مسموح • ✗1 ممنوع" (محسوب من overrides).

Dialog جديد `UserAppAccessDialog.tsx`:
- يقرأ القائمة الكاملة من `APPS_VISUAL_META` + `getAppSections()`.
- لكل تطبيق: ثلاثة أزرار (RadioGroup) — حسب الدور / مسموح / ممنوع.
- شريط بحث، "تحديد الكل = حسب الدور" (إعادة تعيين)، حفظ، Toast.
- مجمعة حسب القسم (Core / Operations / Premium).

## 4) Hook موحّد + تطبيق الحماية

Hook جديد `src/hooks/useEffectiveAppAccess.ts`:
```text
effectiveAppAccess(appKey):
  if super_admin or admin(owner)  → ALLOW
  if override = deny              → DENY  (أقوى من allow)
  if override = allow             → ALLOW
  else                            → inherit (الدور + hidden_apps + ROLE_ALLOWED_APPS)
```

تعديلات:
- `AppsLauncher.tsx`: فلترة `appSections` بـ `effectiveAppAccess`.
- `AppSidebar.tsx` و `QuickAccessGrid.tsx`: إخفاء العناصر الممنوعة.
- `ModuleGuard.tsx`: عند DENY على الـ appKey المرتبط بالـ route → عرض `LockedModulePage` (يمنع الفتح بالرابط المباشر).
- `useLockedModules.ts`: تمديد `isRouteLocked` لاستخدام overrides أيضاً.

تحميل overrides مرة واحدة لكل مستخدم عبر hook مع cache (React Query/state)، ومستمع Realtime على `user_app_access_overrides` لمزامنة فورية عند تعديل الأدمن.

## 5) Audit Log

trigger يكتب لكل تغيير:
```text
action          = 'update_user_app_access'
entity_type     = 'user_app_access'
entity_id       = target_user_id
entity_label    = app_key
details         = { app_key, old, new, company_id }
actor_id/name   = من جلسة الـ Postgres (auth.uid())
```

## 6) اختبارات قبول

1. أدمن Qamar Brand → يفتح إدارة تطبيقات لـ momen → يضع "المشتريات = مسموح" → تسجيل دخول momen → التطبيق يظهر ويفتح.
2. وضع "المبيعات = ممنوع" لـ momen → التطبيق يختفي من Launcher/Sidebar، وفتح `/sales` يعرض LockedModulePage.
3. محاولة الأدمن من شركة أخرى تعديل overrides لمستخدم من Qamar → الـ edge function ترجع 403، ولا insert في الجدول (RLS).
4. سطر في `activity_log` لكل تغيير مع old/new.

## ملاحظات تقنية

- لا نستخدم email في أي مكان — `target_user_id` فقط.
- `access_state` = enum-style check؛ default = `inherit`.
- لا نضع override = inherit في الجدول (نحذف الصف بدلاً من ذلك) لتبسيط الكويري.
- super_admin و admin (صاحب الشركة) لا يمكن منعهما من شيء.
- لا نُغيّر منطق الاشتراك/hidden_apps الموجود — فقط نضيف طبقة overrides فوقه.

## الملفات المتأثرة

- جديد: `supabase/migrations/<ts>_user_app_access_overrides.sql`
- جديد: `supabase/functions/manage-user-app-access/index.ts`
- جديد: `src/hooks/useEffectiveAppAccess.ts`
- جديد: `src/components/settings/UserAppAccessDialog.tsx`
- تعديل: `UsersSettingsSection.tsx`, `AppsLauncher.tsx`, `AppSidebar.tsx`, `QuickAccessGrid.tsx`, `ModuleGuard.tsx`, `useLockedModules.ts`
