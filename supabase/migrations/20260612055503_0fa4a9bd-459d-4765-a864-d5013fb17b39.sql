-- 1) إسقاط الـ constraint المكرر
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_idempotency_key_unique;

-- 2) فهرس لتسريع البحث عن قيود مستند (reference) داخل tenant
CREATE INDEX IF NOT EXISTS idx_transactions_user_reference
  ON public.transactions (user_id, reference)
  WHERE reference IS NOT NULL;

-- 3) فهرس فترة tax_ledger
CREATE INDEX IF NOT EXISTS idx_tax_ledger_user_date
  ON public.tax_ledger (user_id, transaction_date);

COMMENT ON INDEX public.idx_transactions_user_reference IS
'ج4: تسريع جلب القيود حسب رقم المستند (reference) داخل tenant.';

COMMENT ON INDEX public.idx_tax_ledger_user_date IS
'ج4: تسريع تقارير VAT حسب الفترة الزمنية لكل tenant.';