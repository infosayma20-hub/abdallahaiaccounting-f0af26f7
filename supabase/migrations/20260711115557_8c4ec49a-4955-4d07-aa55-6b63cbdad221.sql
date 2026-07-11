ALTER TABLE public.vouchers
ADD COLUMN IF NOT EXISTS cash_box_id uuid REFERENCES public.cash_boxes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vouchers_cash_box_id
ON public.vouchers(cash_box_id);