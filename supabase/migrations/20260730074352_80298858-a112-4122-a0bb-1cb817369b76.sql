CREATE TABLE public.builtin_form_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  form_key text NOT NULL,
  label_override text,
  description_override text,
  is_enabled boolean NOT NULL DEFAULT true,
  closed_message text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, form_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builtin_form_settings TO authenticated;
GRANT ALL ON public.builtin_form_settings TO service_role;

ALTER TABLE public.builtin_form_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view builtin form settings"
ON public.builtin_form_settings FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Admins and HR can insert builtin form settings"
ON public.builtin_form_settings FOR INSERT TO authenticated
WITH CHECK (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role)));

CREATE POLICY "Admins and HR can update builtin form settings"
ON public.builtin_form_settings FOR UPDATE TO authenticated
USING (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role)))
WITH CHECK (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role)));

CREATE POLICY "Admins and HR can delete builtin form settings"
ON public.builtin_form_settings FOR DELETE TO authenticated
USING (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role)));

CREATE TRIGGER update_builtin_form_settings_updated_at
BEFORE UPDATE ON public.builtin_form_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();