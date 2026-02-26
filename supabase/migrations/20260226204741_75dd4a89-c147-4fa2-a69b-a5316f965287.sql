
-- ============================================
-- 1. ROLE SYSTEM
-- ============================================
CREATE TYPE public.app_role AS ENUM ('admin', 'hr_manager', 'employee');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 2. BRANCHES
-- ============================================
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage branches"
  ON public.branches FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "HR can view branches"
  ON public.branches FOR SELECT
  USING (public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "Employees can view branches"
  ON public.branches FOR SELECT
  USING (public.has_role(auth.uid(), 'employee'));

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. QR TOKENS (rotating per branch)
-- ============================================
CREATE TABLE public.qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active tokens"
  ON public.qr_tokens FOR SELECT
  USING (auth.uid() IS NOT NULL AND expires_at > now());

CREATE POLICY "Owner/admin can manage tokens"
  ON public.qr_tokens FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.branches WHERE id = branch_id AND user_id = auth.uid())
  );

-- ============================================
-- 4. LINK EMPLOYEES TO AUTH ACCOUNTS
-- ============================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- ============================================
-- 5. ATTENDANCE EVENTS (individual punches)
-- ============================================
CREATE TABLE public.attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in', 'check_out')),
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  qr_token_used TEXT,
  device_info TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'invalid', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own events"
  ON public.attendance_events FOR SELECT
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Employees can insert own events"
  ON public.attendance_events FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "HR can view all events"
  ON public.attendance_events FOR SELECT
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "HR can update events"
  ON public.attendance_events FOR UPDATE
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 6. ATTENDANCE DAYS (daily summary)
-- ============================================
CREATE TABLE public.attendance_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  first_check_in TIMESTAMPTZ,
  last_check_out TIMESTAMPTZ,
  total_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'late', 'incomplete', 'leave', 'holiday')),
  is_manually_adjusted BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, attendance_date)
);

ALTER TABLE public.attendance_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own days"
  ON public.attendance_days FOR SELECT
  USING (auth.uid() = auth_user_id);

CREATE POLICY "System can insert days"
  ON public.attendance_days FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "HR can view all days"
  ON public.attendance_days FOR SELECT
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "HR can update days"
  ON public.attendance_days FOR UPDATE
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can update own days"
  ON public.attendance_days FOR UPDATE
  USING (auth.uid() = auth_user_id);

CREATE TRIGGER update_attendance_days_updated_at
  BEFORE UPDATE ON public.attendance_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 7. CORRECTION REQUESTS
-- ============================================
CREATE TABLE public.correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  attendance_day_id UUID REFERENCES public.attendance_days(id),
  attendance_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('missing_checkin', 'missing_checkout', 'wrong_time', 'other')),
  requested_time TIMESTAMPTZ,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own requests"
  ON public.correction_requests FOR SELECT
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Employees can create requests"
  ON public.correction_requests FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "HR can view all requests"
  ON public.correction_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "HR can update requests"
  ON public.correction_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 8. AUDIT LOGS
-- ============================================
CREATE TABLE public.attendance_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'approve', 'reject')),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view audit logs"
  ON public.attendance_audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'hr_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit logs"
  ON public.attendance_audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
