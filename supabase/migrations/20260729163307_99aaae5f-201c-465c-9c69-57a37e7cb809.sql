CREATE TABLE IF NOT EXISTS public.pos_prepayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  call_center_order_id uuid,
  session_id uuid,
  branch_id uuid,
  terminal_id uuid,
  cashier_name text,
  created_by uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ILS',
  method text NOT NULL DEFAULT 'cash',
  note text,
  status text NOT NULL DEFAULT 'held',
  applied_session_id uuid,
  applied_order_id uuid,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_prepayments TO authenticated;
GRANT ALL ON public.pos_prepayments TO service_role;

ALTER TABLE public.pos_prepayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can view pos prepayments" ON public.pos_prepayments
  FOR SELECT TO authenticated USING (is_team_member(auth.uid(), user_id));
CREATE POLICY "team can insert pos prepayments" ON public.pos_prepayments
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), user_id));
CREATE POLICY "team can update pos prepayments" ON public.pos_prepayments
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), user_id))
  WITH CHECK (is_team_member(auth.uid(), user_id));

CREATE INDEX IF NOT EXISTS idx_pos_prepayments_session ON public.pos_prepayments(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_prepayments_applied_session ON public.pos_prepayments(applied_session_id);
CREATE INDEX IF NOT EXISTS idx_pos_prepayments_cco ON public.pos_prepayments(call_center_order_id);

CREATE TRIGGER trg_pos_prepayments_updated_at
  BEFORE UPDATE ON public.pos_prepayments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();