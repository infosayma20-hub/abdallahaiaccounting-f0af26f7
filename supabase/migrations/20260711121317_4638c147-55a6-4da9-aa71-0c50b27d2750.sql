ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_returns_cost_center_id
  ON public.returns(cost_center_id);