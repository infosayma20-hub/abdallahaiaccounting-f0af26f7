CREATE OR REPLACE FUNCTION public.recompute_attendance_day_totals(p_day_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ci timestamptz;
  v_co timestamptz;
  v_gross_minutes integer := 0;
  v_break_minutes integer := 0;
  v_net_minutes integer := 0;
  v_daily_hours numeric := 8;
  v_emp_id uuid;
BEGIN
  SELECT first_check_in, last_check_out, employee_id
    INTO v_ci, v_co, v_emp_id
    FROM public.attendance_days
   WHERE id = p_day_id;

  -- Seconds are rounded to the NEAREST minute (0-29s down, 30-59s up).
  IF v_ci IS NOT NULL AND v_co IS NOT NULL AND v_co > v_ci THEN
    v_gross_minutes := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_co - v_ci))::numeric / 60.0)::int);
  END IF;

  SELECT COALESCE(SUM(
           CASE
             WHEN break_in IS NOT NULL AND break_in > break_out
               THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (break_in - break_out))::numeric / 60.0)::int)
             WHEN duration_minutes IS NOT NULL
               THEN GREATEST(0, duration_minutes)
             ELSE 0
           END
         ), 0)::int
    INTO v_break_minutes
    FROM public.attendance_breaks
   WHERE attendance_day_id = p_day_id;

  v_net_minutes := GREATEST(0, v_gross_minutes - v_break_minutes);

  BEGIN
    SELECT COALESCE(work_hours_per_day, 8) INTO v_daily_hours
      FROM public.employees WHERE id = v_emp_id;
  EXCEPTION WHEN OTHERS THEN
    v_daily_hours := 8;
  END;

  UPDATE public.attendance_days
     SET total_break_minutes = v_break_minutes,
         net_work_minutes    = v_net_minutes,
         total_hours         = ROUND((v_net_minutes::numeric) / 60.0, 2),
         overtime_hours      = GREATEST(0, ROUND((v_net_minutes::numeric)/60.0 - v_daily_hours, 2)),
         updated_at          = now()
   WHERE id = p_day_id;
END;
$function$;