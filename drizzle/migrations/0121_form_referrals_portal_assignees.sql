ALTER TABLE public.employee_form_referrals ALTER COLUMN assignee_employee_id DROP NOT NULL;
ALTER TABLE public.employee_form_referrals ADD CONSTRAINT employee_form_referrals_assignee_chk
  CHECK (assignee_employee_id IS NOT NULL OR assignee_auth_user_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.list_form_referral_portal_assignees()
RETURNS TABLE(auth_user_id uuid, full_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.auth_user_id, m.full_name, m.role
  FROM public.malaki_portal_users m
  WHERE m.user_id = public.get_team_owner_id(auth.uid())
    AND COALESCE(m.is_active, true)
    AND m.auth_user_id IS NOT NULL
    AND (auth.uid() = m.user_id
         OR public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'hr_manager'::app_role))
  ORDER BY m.full_name
$$;
REVOKE ALL ON FUNCTION public.list_form_referral_portal_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_form_referral_portal_assignees() TO authenticated;