ALTER TABLE public.pos_prepayments
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS foreign_amount numeric,
  ADD COLUMN IF NOT EXISTS visa_gl_account_code text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS tender_index integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_prepayments.amount IS 'ILS-equivalent amount of this tender (always in ILS)';
COMMENT ON COLUMN public.pos_prepayments.foreign_amount IS 'Amount in the tender currency (for foreign cash tenders)';
COMMENT ON COLUMN public.pos_prepayments.method IS 'cash | card (visa) — deposits are operational only, no journal entry is created';