-- Safety: normalize any stray legacy values before adding the constraint
UPDATE public.invoices SET invoice_type = 'sale' WHERE invoice_type = 'sales';

-- Drop prior version if exists, then add canonical CHECK constraint
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_canonical_chk;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_type_canonical_chk
  CHECK (invoice_type IN ('sale','purchase','debit_note','credit_note'));