
-- Fix HR/Admin RLS to use team-owner aware check (is_team_member)
-- so HR managers (invited members) can see attendance for the owner's employees.

-- attendance_days
DROP POLICY IF EXISTS "HR can view organization attendance days" ON public.attendance_days;
CREATE POLICY "HR can view organization attendance days"
ON public.attendance_days FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_days.employee_id
      AND public.is_team_member(auth.uid(), e.user_id)
  )
);

DROP POLICY IF EXISTS "HR can update organization attendance days" ON public.attendance_days;
CREATE POLICY "HR can update organization attendance days"
ON public.attendance_days FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_days.employee_id
      AND public.is_team_member(auth.uid(), e.user_id)
  )
);

-- attendance_events
DROP POLICY IF EXISTS "HR can view organization attendance events" ON public.attendance_events;
CREATE POLICY "HR can view organization attendance events"
ON public.attendance_events FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_events.employee_id
      AND public.is_team_member(auth.uid(), e.user_id)
  )
);

DROP POLICY IF EXISTS "HR can update organization attendance events" ON public.attendance_events;
CREATE POLICY "HR can update organization attendance events"
ON public.attendance_events FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_events.employee_id
      AND public.is_team_member(auth.uid(), e.user_id)
  )
);

-- correction_requests
DROP POLICY IF EXISTS "HR can view organization corrections" ON public.correction_requests;
CREATE POLICY "HR can view organization corrections"
ON public.correction_requests FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
      AND public.is_team_member(auth.uid(), e.user_id)
  )
);

DROP POLICY IF EXISTS "HR can update organization corrections" ON public.correction_requests;
CREATE POLICY "HR can update organization corrections"
ON public.correction_requests FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
      AND public.is_team_member(auth.uid(), e.user_id)
  )
);
