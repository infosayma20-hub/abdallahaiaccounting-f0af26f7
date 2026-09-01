CREATE TABLE public.hr_deduction_other_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source_id text NOT NULL,
  employee_name text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_deduction_other_notes TO authenticated;
GRANT ALL ON public.hr_deduction_other_notes TO service_role;
ALTER TABLE public.hr_deduction_other_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage other notes" ON public.hr_deduction_other_notes
FOR ALL USING (is_team_member((SELECT auth.uid()), user_id)) WITH CHECK (is_team_member((SELECT auth.uid()), user_id));
CREATE TRIGGER hr_deduction_other_notes_updated_at BEFORE UPDATE ON public.hr_deduction_other_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();