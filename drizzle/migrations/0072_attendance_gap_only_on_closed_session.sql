DO $mig$
DECLARE f text := pg_get_functiondef('public.recompute_attendance_day'::regproc);
BEGIN
  IF position('v_pending_gap' in f) > 0 THEN RETURN; END IF;
  IF position('              v_departure_minutes := v_departure_minutes + v_gap_minutes;' in f) = 0
     OR position('        v_break_minutes := v_break_minutes + GREATEST(0, v_overlap_minutes);' in f) = 0 THEN
    RAISE EXCEPTION 'recompute_attendance_day shape changed';
  END IF;
  f := replace(f, E'  v_gap_minutes integer;\n', E'  v_gap_minutes integer;\n  v_pending_gap integer := 0;\n');
  f := replace(f, '              v_departure_minutes := v_departure_minutes + v_gap_minutes;',
    E'              -- المغادرة تُحتسب فقط إذا انغلقت الجلسة التالية بخروج\n              v_pending_gap := v_gap_minutes;');
  f := replace(f, '        v_break_minutes := v_break_minutes + GREATEST(0, v_overlap_minutes);',
    E'        v_departure_minutes := v_departure_minutes + v_pending_gap;\n        v_pending_gap := 0;\n        v_break_minutes := v_break_minutes + GREATEST(0, v_overlap_minutes);');
  EXECUTE f;
END $mig$;