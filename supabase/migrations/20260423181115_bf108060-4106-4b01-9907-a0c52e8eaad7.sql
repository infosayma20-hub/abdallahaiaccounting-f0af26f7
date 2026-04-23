-- إصلاح الفواتير الفاسدة: payment_method='آجل' لكن paid_amount > 0
-- (سببها: stale form state بعد إزالة UI طرق الدفع)
-- المنطق: الفواتير الآجلة يجب أن يكون paid_amount=0 و remaining_amount=total و payment_status='unpaid'.
-- القبض الفعلي يتم لاحقاً عبر سند قبض (receipt voucher).

WITH corrupted AS (
  SELECT id, contact_id, total_amount, paid_amount
  FROM public.invoices
  WHERE payment_method = 'آجل'
    AND paid_amount > 0
    AND status <> 'cancelled'
),
balance_adjustments AS (
  -- نضيف paid_amount القديمة على رصيد العميل (لأنها كانت محسوبة كأنها مدفوعة)
  SELECT contact_id, SUM(paid_amount) AS delta
  FROM corrupted
  WHERE contact_id IS NOT NULL
  GROUP BY contact_id
)
UPDATE public.contacts c
SET current_balance = COALESCE(current_balance, 0) + ba.delta,
    updated_at = NOW()
FROM balance_adjustments ba
WHERE c.id = ba.contact_id;

-- تصحيح الفواتير نفسها
UPDATE public.invoices
SET paid_amount = 0,
    remaining_amount = total_amount,
    payment_status = 'unpaid',
    updated_at = NOW()
WHERE payment_method = 'آجل'
  AND paid_amount > 0
  AND status <> 'cancelled';

-- سجل التدقيق
INSERT INTO public.activity_log (user_id, actor_id, actor_name, entity_type, entity_id, action, details)
SELECT i.user_id, i.user_id, 'system', 'invoice', i.id,
       'corrected_credit_invoice_payment',
       jsonb_build_object('reason', 'Fixed paid_amount on credit invoice (was incorrectly marked as paid due to stale form state)',
                          'invoice_number', i.invoice_number,
                          'total', i.total_amount)
FROM public.invoices i
WHERE i.payment_method = 'آجل'
  AND i.invoice_number IN ('INV-2026-0007', 'INV-2026-0009', 'INV-2026-0001')
  AND i.status <> 'cancelled';