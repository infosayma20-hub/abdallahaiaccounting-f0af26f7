
-- Allow employees to read their own employee record via auth_user_id
CREATE POLICY "employees_read_own_record"
ON public.employees
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Allow employees to read their own attendance
CREATE POLICY "employee_own_attendance_days"
ON public.attendance_days
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Allow employees to read their own attendance events
CREATE POLICY "employee_own_attendance_events"
ON public.attendance_events
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Allow employees to read their own correction requests
CREATE POLICY "employee_own_corrections"
ON public.correction_requests
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Allow employees to insert correction requests
CREATE POLICY "employee_insert_corrections"
ON public.correction_requests
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = auth.uid());
