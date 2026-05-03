-- Backfill receipt_vouchers for existing Rep Portal collections
INSERT INTO public.receipt_vouchers (
  user_id, contact_id, contact_name, payment_date, amount,
  payment_method, deposit_account_code, notes, status, linked_transaction_id
)
SELECT
  t.user_id,
  t.contact_id,
  c.contact_name,
  t.transaction_date,
  t.amount,
  COALESCE(t.payment_method, 'نقدي'),
  t.debit_account_code,
  COALESCE(t.description, 'تحصيل من بورتال المندوب'),
  'posted',
  t.id
FROM public.transactions t
LEFT JOIN public.contacts c ON c.id = t.contact_id
LEFT JOIN public.receipt_vouchers rv
  ON rv.linked_transaction_id = t.id AND rv.user_id = t.user_id
WHERE t.idempotency_key LIKE 'REP-RCP-%'
  AND t.transaction_type = 'receipt'
  AND COALESCE(t.is_deleted, false) = false
  AND rv.id IS NULL;