---
name: Portal RPC Caller Resolution
description: Every SECURITY DEFINER RPC used by portal users (sales reps / employees) must resolve owner via resolve_effective_owner_id, never filter by auth.uid() directly
type: constraint
---

# قاعدة: حل المتصل في SECURITY DEFINER RPCs

## الخطأ النموذجي
```sql
v_user_id uuid := auth.uid();
... WHERE user_id = v_user_id
```
هذا يفشل لما يدخل **مندوب** أو **موظف** عبر portal:
- `sales_representatives.user_id` = المالك
- `sales_representatives.auth_user_id` = حساب الـ portal للمندوب
- `employees.user_id` = المالك، `employees.auth_user_id` = حساب الموظف

`auth.uid()` للمندوب ≠ `user_id` المالك → الـ RPC ترجع NULL / "not found".

## الحل المعتمد
استخدم `resolve_effective_owner_id(auth.uid())` للحصول على owner، وللتحقق من الصلاحية اقبل المتصل سواء كان owner أو `auth_user_id` للسجل المستهدف.

```sql
v_caller uuid := auth.uid();
v_owner uuid;
v_rep_auth uuid;
SELECT user_id, auth_user_id INTO v_owner, v_rep_auth
  FROM sales_representatives WHERE id = p_sales_rep_id;
IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_rep_auth THEN
  RAISE EXCEPTION 'غير مصرح';
END IF;
-- استخدم v_owner للكتابة على tenant data (user_id = v_owner)
```

## دالة الحل
`public.resolve_effective_owner_id(_auth_uid uuid DEFAULT auth.uid())` ترجع owner من 4 مصادر بالترتيب:
1. `sales_representatives.auth_user_id`
2. `employees.auth_user_id`
3. `profiles.invited_by`
4. `_auth_uid` نفسه (المالك الأساسي)

## RPCs المعدّلة على هذه القاعدة
- `open_van_day`
- `open_van_day_with_entry`
- `close_van_day`

## القاعدة للمستقبل
أي RPC جديد لشاشات `/rep` أو `/portal` لازم:
- لا يستخدم `auth.uid()` مباشرة في فلتر `user_id`
- يستخدم `resolve_effective_owner_id()` للكتابة
- يفحص الصلاحية بقبول owner أو auth_user_id للسجل
