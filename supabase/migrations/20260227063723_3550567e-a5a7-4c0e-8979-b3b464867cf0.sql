
-- 1. Create a secure view for branches WITHOUT secret_key
CREATE OR REPLACE VIEW public.branches_safe AS
  SELECT id, user_id, name, address, latitude, longitude, 
         radius_meters, is_active, qr_rotation_minutes,
         created_at, updated_at
  FROM public.branches;

-- Grant access to the view
GRANT SELECT ON public.branches_safe TO authenticated;
GRANT SELECT ON public.branches_safe TO anon;

-- 2. Create audit log table for sensitive data access
CREATE TABLE IF NOT EXISTS public.sensitive_data_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  ip_address text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sensitive_data_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.sensitive_data_audit FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can insert (for logging their own actions)
CREATE POLICY "System can insert audit logs"
  ON public.sensitive_data_audit FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Create a function to log sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  _user_id uuid,
  _action text,
  _table_name text,
  _record_id text DEFAULT NULL,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sensitive_data_audit (user_id, action, table_name, record_id, details)
  VALUES (_user_id, _action, _table_name, _record_id, _details);
END;
$$;

-- 4. Create a secure view for employees that excludes sensitive fields for non-owners
-- Employees viewing their own record see limited fields; owners see all
CREATE OR REPLACE VIEW public.employees_safe AS
  SELECT 
    id, user_id, full_name, position, department, job_title,
    branch_id, is_active, start_date, end_date,
    salary_type, work_days_per_week, work_hours_per_day,
    annual_leave_days, sick_leave_days,
    auth_user_id, photo_url, email, phone,
    created_at, updated_at,
    -- Sensitive fields only visible to the owner (employer)
    CASE WHEN auth.uid() = user_id THEN id_number ELSE '***' END AS id_number,
    CASE WHEN auth.uid() = user_id THEN bank_name ELSE NULL END AS bank_name,
    CASE WHEN auth.uid() = user_id THEN bank_account ELSE '***' END AS bank_account,
    CASE WHEN auth.uid() = user_id THEN base_salary ELSE 0 END AS base_salary,
    CASE WHEN auth.uid() = user_id THEN hourly_rate ELSE 0 END AS hourly_rate,
    CASE WHEN auth.uid() = user_id THEN emergency_contact ELSE NULL END AS emergency_contact,
    CASE WHEN auth.uid() = user_id THEN emergency_phone ELSE NULL END AS emergency_phone,
    CASE WHEN auth.uid() = user_id THEN address ELSE NULL END AS address,
    CASE WHEN auth.uid() = user_id THEN notes ELSE NULL END AS notes
  FROM public.employees;

GRANT SELECT ON public.employees_safe TO authenticated;
