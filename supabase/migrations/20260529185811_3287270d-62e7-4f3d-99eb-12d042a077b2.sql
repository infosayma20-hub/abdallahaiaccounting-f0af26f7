ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cash_account_code text;

COMMENT ON COLUMN public.invoices.cash_account_code IS
  'GL account code of the cash box / bank account used to settle a cash invoice (payment_method = نقدي). NULL for credit invoices.';