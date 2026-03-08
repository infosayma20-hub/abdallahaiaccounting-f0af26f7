
-- Add recall columns to pos_orders
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS recall_status TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS recall_reason TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS recalled_by TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS recalled_approved_by TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS cancelled_approved_by TEXT DEFAULT NULL;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;

-- Create audit log table (INSERT only)
CREATE TABLE IF NOT EXISTS public.pos_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID REFERENCES public.pos_orders(id),
  action TEXT NOT NULL,
  cashier_id TEXT,
  cashier_name TEXT,
  approved_by TEXT,
  reason TEXT,
  original_total NUMERIC,
  new_total NUMERIC,
  terminal_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own audit logs"
  ON public.pos_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can view own audit logs"
  ON public.pos_audit_log FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
