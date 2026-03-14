
-- Add credit note columns to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_credit_note BOOLEAN DEFAULT FALSE;

-- Add index for credit note lookups
CREATE INDEX IF NOT EXISTS idx_invoices_original_invoice_id ON public.invoices(original_invoice_id) WHERE original_invoice_id IS NOT NULL;
