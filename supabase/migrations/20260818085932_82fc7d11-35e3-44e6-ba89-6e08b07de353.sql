CREATE OR REPLACE FUNCTION public.recompute_attendance_day_totals_for_hr(p_day_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_id uuid;
  v_owner_id uuid;
BEGIN
  SELECT ad.employee_id, e.user_id
    INTO v_employee_id, v_owner_id
    FROM public.attendance_days ad
    JOIN public.employees e ON e.id = ad.employee_id
   WHERE ad.id = p_day_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Attendance day not found';
  END IF;

  IF NOT (
    (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role))
    AND public.is_team_member(auth.uid(), v_owner_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to recompute this attendance day';
  END IF;

  PERFORM public.recompute_attendance_day_totals(p_day_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_attendance_day_totals_for_hr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day_totals_for_hr(uuid) TO authenticated, service_role;