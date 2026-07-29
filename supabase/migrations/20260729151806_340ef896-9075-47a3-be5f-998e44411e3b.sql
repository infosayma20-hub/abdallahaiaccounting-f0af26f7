CREATE TABLE public.pos_price_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid,
  branch_name text,
  session_id uuid,
  order_id uuid,
  order_number text,
  product_id uuid,
  product_name text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  original_price numeric NOT NULL DEFAULT 0,
  new_price numeric NOT NULL DEFAULT 0,
  diff_amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pos_price_change_log TO authenticated;
GRANT ALL ON public.pos_price_change_log TO service_role;

ALTER TABLE public.pos_price_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can view pos price changes"
ON public.pos_price_change_log FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "team can insert pos price changes"
ON public.pos_price_change_log FOR INSERT TO authenticated
WITH CHECK (is_team_member(auth.uid(), user_id));

CREATE INDEX idx_pos_price_change_log_owner_date ON public.pos_price_change_log (user_id, created_at DESC);
CREATE INDEX idx_pos_price_change_log_branch ON public.pos_price_change_log (branch_id, created_at DESC);
CREATE INDEX idx_pos_price_change_log_order ON public.pos_price_change_log (order_id);