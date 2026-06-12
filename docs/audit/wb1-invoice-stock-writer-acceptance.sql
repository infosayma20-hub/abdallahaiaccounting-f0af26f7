-- ============================================================
-- WB-1 Acceptance Test — Invoice Stock DB Writer
-- ============================================================
-- شغّل كل خطوة منفصلة ولاحظ النتائج. كل الاختبار داخل tx واحدة قابلة للـ rollback.

BEGIN;

-- 0) جهّز tenant + منتج اختبار
--    استبدل القيم التالية ببيانات حقيقية من بيئتك:
--    \set tenant '00000000-0000-0000-0000-000000000000'
--    \set product '00000000-0000-0000-0000-000000000000'

-- 1) أنشئ فاتورة شراء (sent، غير مسودة)
WITH new_inv AS (
  INSERT INTO public.invoices (user_id, invoice_type, status, invoice_date, total_amount, invoice_number)
  VALUES (:'tenant', 'purchase', 'sent', CURRENT_DATE, 100, 'TEST-WB1-001')
  RETURNING id
),
new_item AS (
  INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, total_amount)
  SELECT id, :'product', 10, 10, 100 FROM new_inv
  RETURNING invoice_id, product_id
)
-- 2) ✅ توقع: حركة 'وارد' بكمية 10 موجودة فوراً (بفضل الـ trigger)
SELECT sm.movement_type, sm.quantity, sm.reference_note
FROM public.stock_movements sm
JOIN new_item ni ON ni.invoice_id = sm.reference_id AND ni.product_id = sm.product_id
WHERE sm.reference_type = 'invoice';

-- 3) عدّل الكمية إلى 25
UPDATE public.invoice_items
SET quantity = 25
WHERE invoice_id = (SELECT id FROM public.invoices WHERE invoice_number='TEST-WB1-001');

-- 4) ✅ توقع: نفس الحركة، لكن الكمية = 25 (UPDATE حدث، ليس INSERT جديد)
SELECT quantity, COUNT(*) FROM public.stock_movements
WHERE reference_type='invoice' AND reference_id =
  (SELECT id FROM public.invoices WHERE invoice_number='TEST-WB1-001')
GROUP BY quantity;

-- 5) احذف البند
DELETE FROM public.invoice_items
WHERE invoice_id = (SELECT id FROM public.invoices WHERE invoice_number='TEST-WB1-001');

-- 6) ✅ توقع: لا توجد حركات لهذه الفاتورة
SELECT COUNT(*) AS should_be_zero FROM public.stock_movements
WHERE reference_type='invoice' AND reference_id =
  (SELECT id FROM public.invoices WHERE invoice_number='TEST-WB1-001');

-- 7) ✅ اختبار idempotency: أعد إنشاء البند ثم حاول INSERT يدوي بنفس المعطيات
INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, total_amount)
SELECT id, :'product', 5, 10, 50
FROM public.invoices WHERE invoice_number='TEST-WB1-001';

-- محاكاة كاتب الواجهة (الحالي): يجب ألا يُنشئ حركة مكررة
INSERT INTO public.stock_movements (product_id, quantity, movement_type, reference_note, user_id, reference_type, reference_id)
SELECT :'product', 5, 'وارد', 'duplicate test', :'tenant', 'invoice', id
FROM public.invoices WHERE invoice_number='TEST-WB1-001';

-- ✅ توقع: حركتان (الـ trigger أنشأ واحدة، الـ INSERT اليدوي ثانية — الـ trigger idempotent
--           لا يمنع INSERT خارجي، لكن لا يكرر. التنظيف P1.)
SELECT COUNT(*) FROM public.stock_movements
WHERE reference_type='invoice' AND reference_id =
  (SELECT id FROM public.invoices WHERE invoice_number='TEST-WB1-001');

-- 8) اختبار المسودة: يجب ألا تنشئ حركة
WITH draft_inv AS (
  INSERT INTO public.invoices (user_id, invoice_type, status, invoice_date, total_amount, invoice_number)
  VALUES (:'tenant', 'purchase', 'draft', CURRENT_DATE, 50, 'TEST-WB1-DRAFT')
  RETURNING id
)
INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, total_amount)
SELECT id, :'product', 99, 1, 99 FROM draft_inv;

-- ✅ توقع: 0 حركات (لأن status='draft')
SELECT COUNT(*) AS draft_should_be_zero FROM public.stock_movements
WHERE reference_type='invoice' AND reference_id =
  (SELECT id FROM public.invoices WHERE invoice_number='TEST-WB1-DRAFT');

ROLLBACK;
-- ============================================================
-- نهاية الاختبار — لا تغييرات دائمة على القاعدة
-- ============================================================