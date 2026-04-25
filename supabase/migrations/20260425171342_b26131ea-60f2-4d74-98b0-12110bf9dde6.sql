
-- Add cash_box_id to sales_representatives for Van Sales linking
ALTER TABLE public.sales_representatives
  ADD COLUMN IF NOT EXISTS cash_box_id uuid REFERENCES public.cash_boxes(id);

CREATE INDEX IF NOT EXISTS idx_sales_reps_cash_box ON public.sales_representatives(cash_box_id);
CREATE INDEX IF NOT EXISTS idx_sales_reps_warehouse ON public.sales_representatives(default_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_reps_auth_user ON public.sales_representatives(auth_user_id);
