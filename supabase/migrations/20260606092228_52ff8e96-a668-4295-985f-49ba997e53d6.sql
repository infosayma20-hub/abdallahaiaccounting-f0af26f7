
-- 1) إعدادات الفرع
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS require_attendance_selfie boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_selfie_retention_days integer NOT NULL DEFAULT 30
    CHECK (attendance_selfie_retention_days BETWEEN 1 AND 365);

-- 2) جدول التحقق
CREATE TABLE IF NOT EXISTS public.attendance_event_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_event_id uuid NOT NULL REFERENCES public.attendance_events(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  verification_type text NOT NULL DEFAULT 'selfie'
    CHECK (verification_type IN ('selfie','face_match','device_binding')),
  storage_path text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aev_event ON public.attendance_event_verifications(attendance_event_id);
CREATE INDEX IF NOT EXISTS idx_aev_employee_captured ON public.attendance_event_verifications(employee_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_aev_tenant ON public.attendance_event_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_aev_captured_at ON public.attendance_event_verifications(captured_at);

GRANT SELECT ON public.attendance_event_verifications TO authenticated;
GRANT ALL ON public.attendance_event_verifications TO service_role;

ALTER TABLE public.attendance_event_verifications ENABLE ROW LEVEL SECURITY;

-- الموظف يرى الميتاداتا الخاصة به فقط (لا يرى الصورة عبر signed URL)
CREATE POLICY "Employee sees own verifications"
ON public.attendance_event_verifications FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

-- HR/admin يرون verifications ضمن نفس المستأجر
CREATE POLICY "HR/admin see tenant verifications"
ON public.attendance_event_verifications FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND is_team_member(auth.uid(), user_id)
);

-- لا يوجد INSERT/UPDATE/DELETE policy للمستخدمين — service_role فقط من edge functions

-- 3) سياسات Storage على bucket attendance-selfies
-- الكتابة محصورة بـ service_role (لا policy = ممنوع للمستخدمين)
-- القراءة المباشرة ممنوعة؛ HR يحصل على signed URL عبر edge function بـ service_role

-- نسمح للموظف بقراءة ملفه الخاص فقط (مسار: {tenant}/{employee}/...) عبر مساره الموقّع إذا احتجنا لاحقاً
-- حالياً: لا نسمح بأي قراءة من العميل مباشرة — كل القراءة عبر signed URL مولّد من edge function service_role

-- 4) تفعيل بلازا مول فقط
UPDATE public.branches
SET require_attendance_selfie = true
WHERE id = 'f82642e1-ce32-456e-8ef8-e556d8d65af9';

-- 5) RPC للـ HR لجلب storage_path (signed URL يولّد من edge function)
CREATE OR REPLACE FUNCTION public.get_attendance_selfie_path(_event_id uuid)
RETURNS TABLE(storage_path text, captured_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT v.user_id INTO v_tenant
  FROM public.attendance_event_verifications v
  WHERE v.attendance_event_id = _event_id
  ORDER BY v.captured_at DESC
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND is_team_member(auth.uid(), v_tenant)
  ) THEN
    RAISE EXCEPTION 'Forbidden: HR or admin role required';
  END IF;

  RETURN QUERY
  SELECT v.storage_path, v.captured_at
  FROM public.attendance_event_verifications v
  WHERE v.attendance_event_id = _event_id
  ORDER BY v.captured_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_selfie_path(uuid) TO authenticated;
