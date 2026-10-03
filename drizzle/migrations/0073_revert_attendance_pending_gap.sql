DO $mig$
DECLARE f text := pg_get_functiondef('public.recompute_attendance_day'::regproc);
BEGIN
  IF position('v_pending_gap' in f) = 0 THEN RETURN; END IF;
  f := replace(f, E'  v_pending_gap integer := 0;\n', '');
  f := replace(f, E'              -- المغادرة تُحتسب فقط إذا انغلقت الجلسة التالية بخروج\n              v_pending_gap := v_gap_minutes;',
    '              v_departure_minutes := v_departure_minutes + v_gap_minutes;');
  f := replace(f, E'        v_departure_minutes := v_departure_minutes + v_pending_gap;\n        v_pending_gap := 0;\n', '');
  IF position('v_pending_gap' in f) > 0 THEN RAISE EXCEPTION 'revert failed'; END IF;
  EXECUTE f;
END $mig$;