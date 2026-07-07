
-- Fix HR messages routing: the RLS policy was matching e.user_id (data owner)
-- instead of e.auth_user_id (employee's own auth uid), so messages inserted
-- with the correct employee auth uid would be rejected, and messages that
-- passed used the owner uid and were invisible to the employee.
DROP POLICY IF EXISTS "HR can send messages to team employees" ON public.correction_requests;
CREATE POLICY "HR can send messages to team employees"
ON public.correction_requests
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role((SELECT auth.uid()), 'hr_manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role))
  AND (request_type = ANY (ARRAY['hr_message'::text, 'penalty'::text]))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
      AND is_team_member((SELECT auth.uid()), e.user_id)
      AND e.auth_user_id = correction_requests.auth_user_id
  )
);

-- Backfill: repair existing HR messages that were addressed to the owner uid.
UPDATE public.correction_requests cr
SET auth_user_id = e.auth_user_id
FROM public.employees e
WHERE e.id = cr.employee_id
  AND cr.request_type IN ('hr_message','penalty')
  AND e.auth_user_id IS NOT NULL
  AND cr.auth_user_id = e.user_id
  AND cr.auth_user_id <> e.auth_user_id;
