
CREATE TABLE public.stockout_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NULL,
  product_id uuid NULL,
  modifier_option_id uuid NULL,
  custom_label text NULL,
  raised_by uuid NULL,
  raised_by_name text NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  resolved_by uuid NULL,
  resolved_by_name text NULL,
  resolved_at timestamptz NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stockout_alerts_user_status ON public.stockout_alerts(user_id, status);
CREATE INDEX idx_stockout_alerts_branch ON public.stockout_alerts(branch_id);
CREATE INDEX idx_stockout_alerts_raised_at ON public.stockout_alerts(raised_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.stockout_alerts TO authenticated;
GRANT ALL ON public.stockout_alerts TO service_role;

ALTER TABLE public.stockout_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stockout_alerts_team_select" ON public.stockout_alerts
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "stockout_alerts_team_insert" ON public.stockout_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "stockout_alerts_team_update" ON public.stockout_alerts
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER trg_stockout_alerts_updated_at
  BEFORE UPDATE ON public.stockout_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stockout_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stockout_alerts;
