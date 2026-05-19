
CREATE TABLE IF NOT EXISTS public.kds_pilot_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  branch_id UUID,
  order_number TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_label TEXT,
  internet_ok BOOLEAN DEFAULT true,
  was_refreshed BOOLEAN DEFAULT false,
  expected_result TEXT,
  actual_result TEXT,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed','wontfix')),
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kds_pilot_issues_company ON public.kds_pilot_issues(company_id, occurred_at DESC);

ALTER TABLE public.kds_pilot_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view pilot issues"
  ON public.kds_pilot_issues FOR SELECT
  USING (company_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Tenant members can insert pilot issues"
  ON public.kds_pilot_issues FOR INSERT
  WITH CHECK (company_id = public.get_team_owner_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Tenant members can update pilot issues"
  ON public.kds_pilot_issues FOR UPDATE
  USING (company_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Tenant members can delete pilot issues"
  ON public.kds_pilot_issues FOR DELETE
  USING (company_id = public.get_team_owner_id(auth.uid()));

CREATE TRIGGER trg_kds_pilot_issues_updated_at
  BEFORE UPDATE ON public.kds_pilot_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
