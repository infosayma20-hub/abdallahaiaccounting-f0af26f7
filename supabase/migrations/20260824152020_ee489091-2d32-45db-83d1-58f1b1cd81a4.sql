CREATE TABLE public.hr_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_by uuid,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  related_form_id uuid REFERENCES public.employee_forms(id) ON DELETE SET NULL,
  title text NOT NULL,
  note text,
  remind_at date NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hr_reminders_due_idx ON public.hr_reminders (user_id, remind_at) WHERE is_done = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_reminders TO authenticated;
GRANT ALL ON public.hr_reminders TO service_role;

ALTER TABLE public.hr_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view hr reminders"
ON public.hr_reminders FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Admins and HR can insert hr reminders"
ON public.hr_reminders FOR INSERT TO authenticated
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
);

CREATE POLICY "Admins and HR can update hr reminders"
ON public.hr_reminders FOR UPDATE TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
);

CREATE POLICY "Admins and HR can delete hr reminders"
ON public.hr_reminders FOR DELETE TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
);

CREATE TRIGGER hr_reminders_touch_updated_at
BEFORE UPDATE ON public.hr_reminders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();