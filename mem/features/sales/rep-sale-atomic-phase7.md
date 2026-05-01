---
name: Rep Sale Atomic (Phase 7)
description: RPC موحّد ذرّي يربط البيع المتجول بالمحاسبة والمخزون والربح في معاملة واحدة
type: feature
---

# Phase 7 — Rep Sale Atomic Integration

## القاعدة
أي بيع من `/rep/new-order` يجب أن يمر عبر `create_rep_sale_atomic` عندما `company_settings.feature_flags.rep_use_rpc = true`.
ممنوع `direct insert` للفواتير من شاشة المندوب على المسار الجديد.

## ما يقوم به الـ RPC داخل معاملة واحدة
1. `create_invoice_with_entry` — رأس الفاتورة + قيد دفتر الأستاذ (Phase 5H)
2. `invoice_items.insert` مع لقطة `cost_price` من `products.buy_price` و `line_profit` محسوب
3. `stock_movements.insert` مع `warehouse_id = rep warehouse` ثم `decrement_stock_safe`
4. (Cash فقط) `create_receipt_with_entry` لإنشاء سند قبض تلقائي

## Idempotency
المفتاح هو `invoice_number` (مثل `REP-{timestamp}`). إعادة الإرسال ترجع `duplicate=true` بدون كسر.

## Rollout
- ✅ مفعّل: `saymehosaid` (f095ae37-960c-4de7-8da1-b68cebf0bb50)
- ⛔ بقية المستخدمين: المسار القديم (direct insert فقط بدون ledger ولا stock)

## مصدر التكلفة
`products.buy_price` (MVP). إذا كان NULL → `line_profit = NULL` ويظهر "تكلفة غير محددة" في Dashboard بدلاً من ربح وهمي.

## ملفات
- `supabase/migrations/...create_rep_sale_atomic`
- `src/lib/rep-sale-rpc.ts` (adapter + flag check)
- `src/pages/rep/RepNewOrderPage.tsx` (gated branch)
- `src/pages/rep/RepDashboardPage.tsx` (عرض ربح اليوم من line_profit)
