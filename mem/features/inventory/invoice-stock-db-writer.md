---
name: Invoice Stock DB Writer (WB-1)
description: DB-level idempotent writer that guarantees stock_movements for every non-draft invoice line linked to a product. Covers legacy invoices.invoice_type='sale'/'sales'/'purchase' path.
type: feature
---

# WB-1 — كاتب حركات المخزون على مستوى DB

## حالة الواجهة الأمامية (2026-06-12)
- تمت إزالة كل `supabase.from("stock_movements").insert(...)` المرتبطة بالفواتير من:
  - `src/pages/InvoiceCreatePage.tsx` (مساري إنشاء + تعديل)
  - `src/pages/InvoicesPage.tsx` (`updateInventory` legacy path)
- تحديث `products.quantity` المباشر يبقى في الواجهة (مصدر العرض الفوري للرصيد).
- التريغر `sync_invoice_item_stock` هو المصدر الوحيد لحركات المخزون المرتبطة بالفواتير.
- المسارات الأخرى (`delivery_notes`, Dashboard quick-add) لا تستخدم `reference_type='invoice'` ولا تتعارض.

## التحديث (2026-06-12): الربط بسطر الفاتورة

## التحديث (2026-06-12): الربط بسطر الفاتورة
- المفتاح: `stock_movements.reference_line_id` = `invoice_items.id` (سطر واحد ↔ حركة واحدة).
- `UNIQUE INDEX uniq_stock_mvt_invoice_line` على `(reference_line_id) WHERE reference_type='invoice'` يضمن 1:1.
- التريغر يستخدم `INSERT ... ON CONFLICT (reference_line_id) DO UPDATE` (UPSERT حقيقي).
- الحياة: عند صفر كمية / مسودة / ملغاة / DELETE للسطر → التريغر يحذف الحركة المرتبطة.
- **الـ bug السابق**: المفتاح كان `(invoice_id, product_id)` فيمنع الأسطر 2+ من نفس المنتج. تم إصلاحه باستخدام `invoice_items.id`.
- **Backfill**: 1344 حركة قديمة تمت مزاوجتها مع الأسطر عبر `ROW_NUMBER OVER (PARTITION BY invoice_id, product_id ORDER BY created_at)`. الحركات اليتيمة (تعديلات قديمة قبل التريغر) تم حذفها نهائياً.

## السبب
المسار القديم (`invoices.invoice_type='sale'|'sales'|'purchase'` + `invoice_items`) كان يعتمد على
`InvoiceCreatePage.tsx` (سطر ~1555) لكتابة `stock_movements` من الواجهة. تدقيق 12/6/2026 كشف أن
**47 من 72 فاتورة شراء (65%) لم تكتب أي حركة** بسبب فشل صامت في الواجهة (شبكة/RLS/مسودة → ترحيل).
النتيجة: 281 بنداً مرتبطاً بمنتج فعلي بدون حركة → مخزون غير صحيح.

## الحل (مطبّق 12/6/2026)
Trigger `trg_invoice_item_stock_sync` على `public.invoice_items` يستدعي
`public.sync_invoice_item_stock()` (SECURITY DEFINER, `search_path=public`).

**السلوك:**
- `AFTER INSERT` — ينشئ stock_movement تلقائياً للفواتير غير المسودة (`status NOT IN ('draft','cancelled','void','voided')`)
  المرتبطة ببند له `product_id`.
- `AFTER UPDATE OF quantity, bonus_quantity, product_id, invoice_id` — يحدّث الحركة المرتبطة.
- `AFTER DELETE` — يحذف الحركة المرتبطة.
- **Idempotent**: لا يكرر — إذا وجدت حركة بنفس `(reference_type='invoice', reference_id, product_id)` لا يدرج.
  هذا يسمح بالتعايش مع كاتب الواجهة الحالي بدون تضارب.

**اتجاهات الحركة:**
- `invoice_type IN ('sale','sales')` → `movement_type='صادر'`, الكمية = `quantity + bonus_quantity`
- `invoice_type='purchase'` → `movement_type='وارد'`, الكمية = `quantity`

**ما لا يلمسه:**
- المسار الحديث `purchase_invoices` (له triggers خاصة).
- المسار `invoice_void` (الفواتير الملغاة لها حركة عكسية منفصلة).
- البنود بدون منتج (الخدمات).

## الفهرس المساعد
`idx_stock_mvt_invoice_lookup` على `(reference_type, reference_id, product_id) WHERE reference_type='invoice'`.
غير فريد بسبب 25 فاتورة تاريخية فيها duplicates سابقة (تنظيفها مؤجل لـ P1).

## ما المتبقي (P1، بعد الإطلاق)
1. **Backfill**: إنشاء حركات للـ 47 فاتورة شراء قديمة بدون حركات (يحتاج قرار محاسبي لكل فاتورة بسبب تأثير COGS التاريخي).
2. **Cleanup duplicates**: تنظيف الـ 25 فاتورة بحركات مكررة، ثم إضافة `UNIQUE INDEX` بديل للفهرس الحالي.
3. **إزالة كاتب الواجهة**: حذف `supabase.from("stock_movements").insert(...)` من `InvoiceCreatePage.tsx`
   (3 مواقع: ~1465, ~1555, ~1649) بعد التأكد أن الـ trigger يغطي كل الحالات لمدة أسبوع في الإنتاج.

## اختبار القبول
`docs/audit/wb1-invoice-stock-writer-acceptance.sql`

## ملفات الكود
- Migration: `supabase/migrations/<timestamp>_wb1_invoice_stock_writer.sql`
- Frontend (لم يُلمس): `src/pages/InvoiceCreatePage.tsx` (سطر 1465, 1555, 1649)