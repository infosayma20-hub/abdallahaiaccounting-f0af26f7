
ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS employee_acknowledged_at TIMESTAMPTZ;

ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS employee_acknowledged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_correction_requests_ack
  ON public.correction_requests (auth_user_id, employee_acknowledged_at)
  WHERE request_type IN ('penalty','hr_message');

CREATE INDEX IF NOT EXISTS idx_employee_forms_ack
  ON public.employee_forms (employee_id, employee_acknowledged_at)
  WHERE form_type = 'disciplinary_action';

CREATE OR REPLACE FUNCTION public.acknowledge_disciplinary(
  p_source TEXT,
  p_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_updated INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_source = 'correction_requests' THEN
    UPDATE public.correction_requests
      SET employee_acknowledged_at = COALESCE(employee_acknowledged_at, now())
      WHERE id = p_id
        AND auth_user_id = v_uid
        AND request_type IN ('penalty','hr_message');
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSIF p_source = 'employee_forms' THEN
    UPDATE public.employee_forms ef
      SET employee_acknowledged_at = COALESCE(employee_acknowledged_at, now())
      WHERE ef.id = p_id
        AND ef.form_type = 'disciplinary_action'
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = ef.employee_id AND e.auth_user_id = v_uid
        );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_disciplinary(TEXT, UUID) TO authenticated;
