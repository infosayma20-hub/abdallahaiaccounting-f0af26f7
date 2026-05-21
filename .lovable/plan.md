## الهدف
تطوير الصلاحيات من "فتح/إغلاق تطبيق" إلى **صلاحيات داخل التطبيق** (view/create/update/delete/print/export/approve/cancel...) مع فرضها على ثلاث طبقات: **UI / Route / Backend**.

---

## 1. البنية المعمارية (3 طبقات لا تتجاوز)

```text
┌──────────────────────────────────────────────────────────┐
│ Layer 1: UI guard   → <Can/> + hook usePermission        │ ← يُخفي/يعطّل الأزرار
│ Layer 2: Route      → ModuleGuard موسّع                  │ ← يمنع الدخول على صفحة كاملة
│ Layer 3: Backend    → has_feature_permission() في DB     │ ← المصدر الحقيقي للحماية
│                       + فحص داخل كل Edge Function حساس   │
└──────────────────────────────────────────────────────────┘
```

القاعدة الذهبية: **الواجهة للتجربة، الـ Backend هو الحماية الفعلية.**

---

## 2. قاعدة البيانات

**جدول جديد:** `user_feature_permissions`

| عمود | نوع | ملاحظة |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | تعبئة تلقائية من target.invited_by/company_id |
| company_id | uuid | denormalized من target.profiles |
| target_user_id | uuid NOT NULL | |
| app_key | text NOT NULL | يطابق app_key في user_app_access_overrides |
| feature_key | text NOT NULL | مثل `invoices`, `sell`, `products` |
| permission_key | text NOT NULL | مثل `view`, `create`, `discount` |
| access_state | text CHECK IN ('allow','deny') | inherit = حذف الصف |
| created_by, created_at, updated_at | | |

**UNIQUE:** `(target_user_id, app_key, feature_key, permission_key)`

**Triggers (نفس نمط uaao):**
- `ufp_fill_meta` (BEFORE) — يعبّئ company_id/owner_id من target
- `ufp_audit` (AFTER) — يكتب لـ `activity_log` بـ `action='update_user_feature_permission'`

**Helper DB Functions:**
```sql
-- يرجع التأثير الفعلي: 'allow' | 'deny' | 'inherit'
public.get_feature_permission_state(_user uuid, _app text, _feature text, _perm text) RETURNS text

-- shortcut: true/false (super_admin → true دائماً، deny → false، allow → true،
-- inherit → role default من جدول role_default_feature_permissions)
public.has_feature_permission(_user uuid, _app text, _feature text, _perm text) RETURNS boolean
```

**جدول مرافق:** `role_default_feature_permissions` — قيم inherit الافتراضية لكل دور (admin/accountant_senior/cashier...). يُزرَع بقيم منطقية: admin=ALL, accountant_senior=view+create+update+print على المبيعات/المشتريات/المالية لا حذف ولا اعتماد، cashier=POS فقط، إلخ.

**RLS** على `user_feature_permissions` (نسخة طبق الأصل من uaao المتشددة):
- SELECT: `target=self OR (uaao_is_actor_admin AND uaao_can_admin_target)`
- INSERT/UPDATE/DELETE: `target≠self AND uaao_is_actor_admin AND uaao_can_admin_target`

نُعيد استخدام `uaao_is_actor_admin` و `uaao_can_admin_target` الموجودة.

---

## 3. السجل المركزي للصلاحيات

**ملف جديد:** `src/config/appPermissions.ts`

```ts
export interface FeatureDef {
  key: string;                  // 'invoices'
  label: string;                // 'الفواتير'
  permissions: PermissionDef[]; // [{key:'view',label:'مشاهدة'}, ...]
}
export interface AppPermissionsDef {
  app_key: string;
  features: FeatureDef[];
}
export const APP_PERMISSIONS: AppPermissionsDef[] = [
  { app_key: 'sales',     features: [
    { key:'invoices',  permissions: [view, create, update, delete, cancel, print, export_] },
    { key:'customers', permissions: [view, create, update, delete] },
  ]},
  { app_key: 'purchases', features: [...] },
  { app_key: 'pos',       features: [
    { key:'sell', permissions: [view, create_order, discount, change_price, refund,
                                open_drawer, close_shift, print_receipt] },
    { key:'kds',  permissions: [manage] },
  ]},
  { app_key: 'inventory', features: [...] },
  { app_key: 'finance',   features: [
    { key:'receipts', permissions: [view, create, update, delete, print] },
    { key:'payments', permissions: [view, create, update, delete, print] },
    { key:'journal',  permissions: [view, create, update, delete, approve] },
  ]},
  { app_key: 'settings',  features: [
    { key:'users',           permissions: [manage] },
    { key:'roles',           permissions: [manage] },
    { key:'company',         permissions: [update] },
    { key:'pos_settings',    permissions: [update] },
    { key:'app_permissions', permissions: [manage] },
  ]},
];
```

نبدأ بـ: **sales, purchases, pos, finance, settings** (Phase 1).
يبقى inventory/hr/reports... لمرحلة لاحقة دون كسر شيء (inherit يعني افتراضي الدور).

---

## 4. Hook الواجهة

**ملف جديد:** `src/hooks/usePermission.ts`

```ts
const perms = usePermission('sales');
perms.can('invoices', 'create');         // boolean
perms.canAny([['invoices','create'], ['invoices','update']]);
perms.canAll([...]);
perms.isAppAllowed();                    // يستدعي useMyAppOverrides + isModuleLocked
perms.loading;                           // أثناء التحميل لا تظهر أزرار حساسة
```

داخلياً يقرأ:
1. user_app_access_overrides (الموجود) — لتقرير isAppAllowed
2. user_feature_permissions الخاص بالمستخدم (Realtime sub)
3. role defaults من `role_default_feature_permissions` (cached)
4. ترتيب: `super_admin > app_deny > feature_deny > feature_allow > role_default > false`

**مكون مساعد:**
```tsx
<Can app="sales" feature="invoices" perm="create">
  <Button>إنشاء فاتورة</Can>
</Can>

<Can app="sales" feature="invoices" perm="create" fallback={
  <Button disabled title="لا تملك صلاحية">إنشاء فاتورة</Button>
}>
  <Button>إنشاء فاتورة</Button>
</Can>
```

---

## 5. ModuleGuard موسّع

داخل `ModuleGuard.tsx` نضيف: إذا الصفحة لها metadata `requiredPermission`:
```tsx
<Route path="/sales/new" element={
  <ModuleGuard requireFeature={{app:'sales', feature:'invoices', perm:'create'}}>
    <NewInvoicePage/>
  </ModuleGuard>
} />
```
إذا الصلاحية مرفوضة → نفس `LockedModulePage` لكن برسالة "لا تملك صلاحية إنشاء فواتير".

---

## 6. واجهة الإدارة

**في `UserAppAccessDialog.tsx`:** تحت كل تطبيق نضيف `<Accordion>` "صلاحيات داخل التطبيق" يَظهر فقط إذا app_state ≠ deny.

لكل feature.permission سطر بـ 3 أزرار: **حسب الدور / مسموح / ممنوع** (نفس نمط STATE_CLASS الحالي).

عداد في رأس المودال يضاف له: "صلاحيات داخلية مخصصة: N".

الحفظ: نفس الـ Edge Function (مع action جديد `upsert_feature` و `reset_feature`).

---

## 7. Edge Function

نوسّع `manage-user-app-access` (نفس endpoint لتجنّب التشظي) بإضافة actions:
- `list_features` (target_user_id, app_key) → overrides + role defaults
- `upsert_feature` (target, app_key, feature_key, permission_key, access_state)
- `reset_feature` (target, app_key, feature_key?, permission_key?)

كل المسارات تمر بنفس الفحص الموجود: `isAdmin && (sameCompany || invitedByActor || isSuperAdmin)`.

---

## 8. حماية Backend (Phase 1 — الأهم)

**ندمج فحص الصلاحية داخل Edge Functions الحساسة الموجودة:**

| Edge Function | فحص مطلوب |
|---|---|
| (أي RPC لإنشاء/تعديل/حذف فاتورة) | `has_feature_permission(uid,'sales','invoices','create'/'update'/'delete')` |
| `process-pos-return` / refund | `pos.sell.refund` |
| `close_pos_shift` | `pos.sell.close_shift` |
| `manage-team-user` / `manage-user-app-access` | `settings.users.manage` (للأدمن العادي، super_admin يتجاوز) |
| تعديل company_settings | `settings.company.update` |
| Journal create/update/delete/approve | `finance.journal.*` |

**نمط الفحص الموحّد (نضيفه في `_shared/auth.ts`):**
```ts
async function requireFeature(svc, actorId, app, feature, perm) {
  const { data } = await svc.rpc('has_feature_permission', {
    _user: actorId, _app: app, _feature: feature, _perm: perm
  });
  if (!data) throw new HttpError(403, `Forbidden: missing ${app}.${feature}.${perm}`);
}
```

**للحذف/التعديل المباشر عبر Supabase client من الواجهة** (دون edge function): RLS الحالية تكفي للعزل بين الشركات، لكن لا تفرض feature-level. حلّان:
- (موصى به) نقل العمليات الحساسة إلى RPC أو Edge Function بدل client.from('invoices').delete().
- (مرحلي) إضافة سياسة RLS مكمّلة على invoices/journal_entries بشرط `has_feature_permission(auth.uid(), 'sales','invoices','delete')` للـ DELETE — يفرض الحماية حتى لو تجاوز المستخدم الواجهة.

سنبدأ بنمط الـ RLS التكميلية على الجداول الحساسة فقط: `invoices`, `purchase_invoices`, `receipt_vouchers`, `payment_vouchers`, `transactions` (journal).

---

## 9. Audit Log

`ufp_audit` trigger يكتب لكل تغيير في `user_feature_permissions`:
```json
{
  "actor_id": auth.uid(),
  "action": "update_user_feature_permission",
  "entity_type": "user_feature_permission",
  "entity_id": target_user_id,
  "entity_label": "<app_key>.<feature_key>.<permission_key>",
  "details": {"app_key","feature_key","permission_key","old","new","company_id"}
}
```
محاولات الرفض في Edge Function تسجّل `feature_permission_denied` (نفس نمط uaao).

---

## 10. تطبيق UI الفعلي (Phase 1 — Smoke set)

نطبّق فعلياً على الأزرار التالية فقط في هذه المرحلة (لإثبات النمط دون كسر):
- **Sales/Invoices list:** زر "فاتورة جديدة" + أيقونات تعديل/حذف/طباعة في الجدول.
- **POS:** حقل الخصم، تغيير السعر، زر "فتح الدرج"، زر "إغلاق الوردية".
- **Settings/Users:** زر إدارة المستخدمين كاملاً يخضع لـ `settings.users.manage`.
- **Finance/Journal:** زر "اعتماد" يخضع لـ `finance.journal.approve`.

باقي التطبيقات (purchases, inventory ...) تُغذّى تلقائياً عبر `<Can>` بمجرد إضافة الأغطية، لكن لا نلمسها في هذا الـ PR.

---

## 11. اختبارات القبول

| # | الاختبار | المتوقع |
|---|---|---|
| 1 | momen مع `sales.invoices.create=deny` يفتح /sales | يدخل، لكن زر "فاتورة جديدة" مخفي |
| 2 | يفتح /sales/new مباشرة | LockedFeaturePage |
| 3 | محاولة POST من console لإنشاء فاتورة | 403 من RLS/Edge |
| 4 | POS: `sell.discount=deny` | حقل الخصم disabled مع tooltip |
| 5 | POS: `sell.open_drawer=deny` | الزر مخفي + drawer لا يفتح |
| 6 | settings: `users.manage=deny` | قسم المستخدمين مخفي، /settings#users لا يفتح |
| 7 | admin Qamar يضع inherit | يرجع للسلوك الافتراضي للدور |
| 8 | super_admin مع deny | يتجاوز |
| 9 | محاسب يحاول الكتابة على user_feature_permissions مباشرة | RLS تمنع (uaao_is_actor_admin=false) |
| 10 | logout/login | لا تبقى صلاحيات قديمة (Realtime + key=user.id) |

---

## مراحل التنفيذ (Pull-request واحد كبير لكنه مرتّب)

1. **Migration:** الجدول + الـ helpers + RLS + role_default_feature_permissions seed (admin=all, accountant_senior, cashier).
2. **Config:** `src/config/appPermissions.ts` (5 تطبيقات).
3. **Hook + `<Can>`:** `usePermission.ts`, `Can.tsx`, `useMyFeaturePermissions.ts` (Realtime).
4. **Edge:** توسيع `manage-user-app-access` بـ list/upsert/reset features.
5. **UI Dialog:** Accordion داخل `UserAppAccessDialog`.
6. **Smoke Apply:** أزرار Phase 1 (Invoices, POS, Settings/Users, Finance/Journal).
7. **Backend Hardening:** `requireFeature()` helper + استدعاؤه في 4-5 edge functions حساسة + سياسة RLS تكميلية على invoices+vouchers+transactions للحذف.
8. **Audit/Tests:** تشغيل اختبارات القبول الـ 10.

تقدير الحجم: ~12 ملف جديد، 8 ملفات معدّلة، 1 migration.

---

## ملاحظات تصميم مهمة

- **لا نكسر شيئاً موجوداً:** القيم الافتراضية في `role_default_feature_permissions` ستُختار بحيث كل مستخدم يحصل تماماً على ما لديه اليوم. أي تغيير ظاهر للمستخدم = override يدوي صريح فقط.
- **app deny ما زال يقطع كل شيء قبل feature checks** → لا تعارض مع النظام الحالي.
- **inherit + الدور غير محدد** = منع (deny-by-default) للأمان.
- **التوسعة لتطبيقات أخرى لاحقاً** = مجرد إضافة سطور في `APP_PERMISSIONS` ولفّ الأزرار بـ `<Can>`، بدون migrations جديدة.

هل أبدأ التنفيذ بهذا الترتيب، أم تفضّل تقسيمه لمرحلتين (DB + Hook + Dialog أولاً، ثم Smoke Apply لاحقاً)؟
