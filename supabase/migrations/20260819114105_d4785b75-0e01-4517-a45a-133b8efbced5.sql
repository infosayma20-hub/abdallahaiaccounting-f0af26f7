CREATE TABLE public.builtin_form_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  form_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, form_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builtin_form_assignments TO authenticated;
GRANT ALL ON public.builtin_form_assignments TO service_role;

ALTER TABLE public.builtin_form_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view builtin form assignments"
ON public.builtin_form_assignments FOR SELECT TO authenticated
USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "Admins and HR can insert builtin form assignments"
ON public.builtin_form_assignments FOR INSERT TO authenticated
WITH CHECK (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'super_admin') OR public.has_role((SELECT auth.uid()), 'hr_manager'))
);

CREATE POLICY "Admins and HR can update builtin form assignments"
ON public.builtin_form_assignments FOR UPDATE TO authenticated
USING (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'super_admin') OR public.has_role((SELECT auth.uid()), 'hr_manager'))
)
WITH CHECK (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'super_admin') OR public.has_role((SELECT auth.uid()), 'hr_manager'))
);

CREATE POLICY "Admins and HR can delete builtin form assignments"
ON public.builtin_form_assignments FOR DELETE TO authenticated
USING (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'super_admin') OR public.has_role((SELECT auth.uid()), 'hr_manager'))
);

CREATE TRIGGER update_builtin_form_assignments_updated_at
BEFORE UPDATE ON public.builtin_form_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_builtin_form_assignments_employee ON public.builtin_form_assignments(employee_id, is_active);