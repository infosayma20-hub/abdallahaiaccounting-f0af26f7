
-- Order status log table for tracking every status change
CREATE TABLE IF NOT EXISTS public.order_status_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id UUID NOT NULL,
  order_table TEXT NOT NULL DEFAULT 'orders',
  from_status TEXT,
  to_status TEXT NOT NULL,
  sub_stage TEXT,
  changed_by UUID NOT NULL,
  changed_by_name TEXT NOT NULL,
  changed_by_role TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  estimated_duration_hours NUMERIC,
  actual_duration_hours NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_status_log_order ON public.order_status_log(order_id);
CREATE INDEX idx_status_log_user ON public.order_status_log(user_id);

-- RLS
ALTER TABLE public.order_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own logs"
ON public.order_status_log FOR SELECT
USING (user_id = (SELECT public.get_team_owner_id(auth.uid())));

CREATE POLICY "Users can insert own logs"
ON public.order_status_log FOR INSERT
WITH CHECK (user_id = (SELECT public.get_team_owner_id(auth.uid())));

-- Add production_status column to qamar_orders if not exists
ALTER TABLE public.qamar_orders ADD COLUMN IF NOT EXISTS production_status TEXT DEFAULT 'pending';
ALTER TABLE public.qamar_orders ADD COLUMN IF NOT EXISTS production_sub_stage TEXT;
