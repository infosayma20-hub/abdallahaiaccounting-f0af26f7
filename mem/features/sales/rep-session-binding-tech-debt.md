---
name: Rep Session Binding (Technical Debt)
description: ربط تحصيلات/مصاريف المندوب صراحةً بـ van_day_id بدل نافذة created_at
type: feature
---

# Rep Portal — Session Binding (Tech Debt)

## الوضع الحالي (مؤقت)
شاشة `/rep` تفلتر حركات العهدة بـ:
```
transactions.created_at >= van_sales_days.opened_at
```
بدل التاريخ (`transaction_date`) لمنع تسرّب حركات عهدة سابقة لم تُغلق إلا متأخراً.

## لماذا غير مثالي
- نافذة زمنية وليست ربطاً قاطعاً.
- لو فُتحت عهدة جديدة قبل إغلاق الأولى رسمياً، يصير تداخل.
- لا يوجد ضمان DB-level أن الحركة تنتمي لعهدة محددة.

## الحل النهائي المطلوب
1. إضافة عمود `van_day_id uuid REFERENCES van_sales_days(id)` على:
   - `transactions` (أو على voucher/receipt headers ثم cascade)
2. تعبئته تلقائياً وقت إنشاء:
   - سندات قبض المندوب (تحصيلات)
   - سندات صرف المندوب (مصاريف + صرف موردين)
3. تغيير فلتر RepDashboard إلى `eq("van_day_id", day.id)`.
4. منع إنشاء حركات مندوب بدون عهدة مفتوحة (DB trigger).

## ملفات متأثرة عند التنفيذ
- `src/pages/rep/RepDashboardPage.tsx`
- `src/pages/rep/RepNewOrderPage.tsx` + شاشات التحصيل/المصروف
- `supabase/functions` أو RPCs الخاصة بـ `create_rep_*`

## الأولوية
متوسطة — الحل المؤقت يكفي للحالات العادية، يصبح حرجاً عند تعدد العهد المتوازية أو فتح يوم جديد قبل إغلاق القديم رسمياً.
