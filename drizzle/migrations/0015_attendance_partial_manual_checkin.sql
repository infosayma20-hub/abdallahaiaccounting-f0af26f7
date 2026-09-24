ALTER TABLE public.attendance_days ADD COLUMN IF NOT EXISTS manual_check_out_set boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.attendance_days.manual_check_out_set IS 'false = HR set only check-in; checkouts and sessions keep following real punches';

DO $mig$
DECLARE s text; n text;
  PROCEDURE_ok boolean;
BEGIN
  s := pg_get_functiondef('public.recompute_attendance_day(uuid,date)'::regprocedure);
  n := s;
  n := replace(n, E'  v_manual_status text;\n', E'  v_manual_status text;\n  v_manual_out_set boolean := true;\n  v_override_first timestamptz;\n');
  n := replace(n, E'ad.first_check_in, ad.last_check_out, ad.status\n    INTO v_day_id, v_auth, v_branch, v_manual, v_manual_first, v_manual_last, v_manual_status',
                  E'ad.first_check_in, ad.last_check_out, ad.status, COALESCE(ad.manual_check_out_set, true)\n    INTO v_day_id, v_auth, v_branch, v_manual, v_manual_first, v_manual_last, v_manual_status, v_manual_out_set');
  n := replace(n, E'  IF v_manual THEN\n    v_first := v_manual_first;',
                  E'  -- تعديل جزئي: الموارد عدّلت وقت الدخول فقط، الجلسات تكمل من البصمات الحقيقية\n  IF v_manual AND NOT v_manual_out_set THEN\n    v_override_first := v_manual_first;\n  END IF;\n\n  IF v_manual AND v_manual_out_set THEN\n    v_first := v_manual_first;');
  n := replace(n, E'        IF v_first IS NULL THEN v_first := r.event_time; END IF;\n        IF v_session_start IS NULL THEN',
                  E'        IF v_first IS NULL THEN\n          v_first := COALESCE(v_override_first, r.event_time);\n          IF v_override_first IS NOT NULL THEN\n            v_session_start := v_override_first;\n          END IF;\n        END IF;\n        IF v_session_start IS NULL THEN');
  n := replace(n, E'    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);\n\n    IF v_paid_enabled AND p_date >= v_policy_from THEN\n      v_net_minutes := v_net_minutes + LEAST(v_departure_minutes',
                  E'    IF v_first IS NULL AND v_override_first IS NOT NULL THEN\n      v_first := v_override_first;\n    END IF;\n\n    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);\n\n    IF v_paid_enabled AND p_date >= v_policy_from THEN\n      v_net_minutes := v_net_minutes + LEAST(v_departure_minutes');
  IF (length(n) - length(s)) < 400 OR position('v_override_first := v_manual_first' in n) = 0
     OR position('COALESCE(v_override_first, r.event_time)' in n) = 0
     OR position('IF v_first IS NULL AND v_override_first IS NOT NULL' in n) = 0
     OR position('v_manual_out_set\n' in n) > 0 THEN
    RAISE EXCEPTION 'recompute patch did not apply cleanly';
  END IF;
  EXECUTE n;

  s := pg_get_functiondef('public.hr_update_attendance_day(uuid,timestamptz,timestamptz,text,text,text,jsonb)'::regprocedure);
  n := replace(s, E'         is_manually_adjusted = true,\n         updated_at = now()\n   WHERE id = p_day_id;',
                  E'         is_manually_adjusted = true,\n         manual_check_out_set = (p_last_check_out IS NOT NULL),\n         updated_at = now()\n   WHERE id = p_day_id;');
  IF n = s THEN RAISE EXCEPTION 'hr_update patch did not apply'; END IF;
  EXECUTE n;
END $mig$;

UPDATE public.attendance_days ad SET manual_check_out_set = false
 WHERE ad.is_manually_adjusted AND ad.attendance_date >= DATE '2026-09-01'
   AND (SELECT (l.new_values->>'last_check_out') IS NULL
          FROM public.attendance_audit_logs l
         WHERE l.table_name='attendance_days' AND l.record_id=ad.id AND l.new_values ? 'first_check_in'
         ORDER BY l.created_at DESC LIMIT 1);

SELECT public.recompute_attendance_day(ad.employee_id, ad.attendance_date)
  FROM public.attendance_days ad
 WHERE ad.is_manually_adjusted AND NOT ad.manual_check_out_set;