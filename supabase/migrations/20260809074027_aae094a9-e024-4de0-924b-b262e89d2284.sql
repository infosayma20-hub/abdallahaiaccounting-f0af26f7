CREATE TABLE public.hr_deduction_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid,
  employee_name text,
  source_kind text NOT NULL DEFAULT 'row',
  source_id text NOT NULL,
  bucket text NOT NULL DEFAULT 'shortage',
  original_amount numeric NOT NULL DEFAULT 0,
  adjusted_amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_deduction_adjustments_unique UNIQUE (user_id, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_deduction_adjustments TO authenticated;
GRANT ALL ON public.hr_deduction_adjustments TO service_role;

ALTER TABLE public.hr_deduction_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_deduction_adjustments_select"
  ON public.hr_deduction_adjustments FOR SELECT TO authenticated
  USING (user_id = public.get_team_owner_id() OR user_id = auth.uid());

CREATE POLICY "hr_deduction_adjustments_insert"
  ON public.hr_deduction_adjustments FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id() OR user_id = auth.uid());

CREATE POLICY "hr_deduction_adjustments_update"
  ON public.hr_deduction_adjustments FOR UPDATE TO authenticated
  USING (user_id = public.get_team_owner_id() OR user_id = auth.uid())
  WITH CHECK (user_id = public.get_team_owner_id() OR user_id = auth.uid());

CREATE POLICY "hr_deduction_adjustments_delete"
  ON public.hr_deduction_adjustments FOR DELETE TO authenticated
  USING (user_id = public.get_team_owner_id() OR user_id = auth.uid());

CREATE INDEX idx_hr_deduction_adjustments_user ON public.hr_deduction_adjustments (user_id);

CREATE TRIGGER trg_hr_deduction_adjustments_updated_at
  BEFORE UPDATE ON public.hr_deduction_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();