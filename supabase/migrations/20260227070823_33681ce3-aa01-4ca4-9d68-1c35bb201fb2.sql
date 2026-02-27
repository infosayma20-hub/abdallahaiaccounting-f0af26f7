
-- 1. Add RLS policies to webauthn_challenges
CREATE POLICY "Users can view own challenges"
ON public.webauthn_challenges FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenges"
ON public.webauthn_challenges FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own challenges"
ON public.webauthn_challenges FOR DELETE
USING (auth.uid() = user_id);

-- 2. Fix HR cross-org RLS policies - scope to organization ownership
DROP POLICY IF EXISTS "HR can view all days" ON public.attendance_days;
DROP POLICY IF EXISTS "HR can update days" ON public.attendance_days;
DROP POLICY IF EXISTS "HR can view all events" ON public.attendance_events;
DROP POLICY IF EXISTS "HR can update events" ON public.attendance_events;
DROP POLICY IF EXISTS "HR can view all requests" ON public.correction_requests;
DROP POLICY IF EXISTS "HR can update requests" ON public.correction_requests;
DROP POLICY IF EXISTS "HR can view audit logs" ON public.attendance_audit_logs;

-- Scoped HR policies for attendance_days
CREATE POLICY "HR can view organization attendance days"
ON public.attendance_days FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_days.employee_id
    AND e.user_id = auth.uid()
  )
);

CREATE POLICY "HR can update organization attendance days"
ON public.attendance_days FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_days.employee_id
    AND e.user_id = auth.uid()
  )
);

-- Scoped HR policies for attendance_events
CREATE POLICY "HR can view organization attendance events"
ON public.attendance_events FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_events.employee_id
    AND e.user_id = auth.uid()
  )
);

CREATE POLICY "HR can update organization attendance events"
ON public.attendance_events FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_events.employee_id
    AND e.user_id = auth.uid()
  )
);

-- Scoped HR policies for correction_requests
CREATE POLICY "HR can view organization corrections"
ON public.correction_requests FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
    AND e.user_id = auth.uid()
  )
);

CREATE POLICY "HR can update organization corrections"
ON public.correction_requests FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
    AND e.user_id = auth.uid()
  )
);

-- Scoped audit log viewing
CREATE POLICY "HR can view organization audit logs"
ON public.attendance_audit_logs FOR SELECT
USING (
  (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'))
);

-- 3. Remove employee direct access to branches table (use branches_safe view instead)
DROP POLICY IF EXISTS "Employees can view branches" ON public.branches;

-- 4. Cleanup function for expired webauthn challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_webauthn_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE created_at < NOW() - INTERVAL '10 minutes';
END;
$$;
