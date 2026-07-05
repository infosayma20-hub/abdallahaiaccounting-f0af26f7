
-- 1) Backfill: fix historical hr_message/penalty rows so auth_user_id points to the
--    EMPLOYEE'S owner uid (what the employee-portal RLS filters on), not the sender's.
UPDATE public.correction_requests cr
SET auth_user_id = e.user_id
FROM public.employees e
WHERE cr.employee_id = e.id
  AND cr.request_type IN ('hr_message','penalty')
  AND cr.auth_user_id IS DISTINCT FROM e.user_id;

-- 2) INSERT policy: HR/admin can create hr_message/penalty rows for any team-member employee
CREATE POLICY "HR can send messages to team employees"
  ON public.correction_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
    AND request_type IN ('hr_message','penalty')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = correction_requests.employee_id
        AND public.is_team_member(auth.uid(), e.user_id)
        AND e.user_id = correction_requests.auth_user_id
    )
  );
