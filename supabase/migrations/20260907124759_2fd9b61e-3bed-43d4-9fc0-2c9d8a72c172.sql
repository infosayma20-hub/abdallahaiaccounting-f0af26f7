CREATE TABLE public.hr_deduction_bucket_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_id text NOT NULL,
  employee_name text,
  bucket text NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_deduction_bucket_overrides TO authenticated;
GRANT ALL ON public.hr_deduction_bucket_overrides TO service_role;

ALTER TABLE public.hr_deduction_bucket_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage bucket overrides"
ON public.hr_deduction_bucket_overrides
FOR ALL
TO authenticated
USING (is_team_member((SELECT auth.uid()), user_id))
WITH CHECK (is_team_member((SELECT auth.uid()), user_id));

CREATE TRIGGER update_hr_deduction_bucket_overrides_updated_at
BEFORE UPDATE ON public.hr_deduction_bucket_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();