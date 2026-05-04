---
name: Canonical invoice_type = 'sale'
description: قيمة موحدة لـ invoice_type في فواتير المبيعات + ثابت مركزي لمنع legacy drift بين 'sale' و 'sales'
type: constraint
---

## القاعدة
- القيمة الرسمية الوحيدة لفاتورة المبيعات: `invoice_type = 'sale'` (مفرد).
- القيمة الرسمية للمشتريات: `'purchase'`.
- للقراءة فقط (دفاعياً ضد البيانات القديمة)، استخدم الثابت `SALES_INVOICE_TYPES = ['sale','sales']` من `src/constants/invoice.ts` عبر `.in('invoice_type', SALES_INVOICE_TYPES)`.
- للكتابة (insert/update) في الواجهة وفي RPCs: **فقط `'sale'`**. ممنوع كتابة `'sales'` نهائياً.

## السبب
نسخة مبكرة من `create_rep_sale_atomic` كتبت `'sales'` بالخطأ. تم تصحيحها لاحقاً + Backfill لتحويل أي صف قديم. نتيجة الـ drift: تقرير `sales-by-supplier` كان يستبعد فواتير المندوب لأنه يفلتر `'sales'` فقط.

## أين الفلتر دفاعي
- `src/pages/rep/RepSalesBySupplierPage.tsx` — يستخدم `SALES_INVOICE_TYPES`.
- باقي التقارير (Dashboard, AR, Collection, Van, Income Statement, KPI Widget…) تستخدم `'sale'` فقط، وهذا آمن لأن DB موحدة الآن (Backfill 2026-05-04).

## ممنوع
- استخدام `'sales'` في أي insert/update جديد.
- إضافة فلتر hardcoded `eq('invoice_type','sales')` في الواجهة.
