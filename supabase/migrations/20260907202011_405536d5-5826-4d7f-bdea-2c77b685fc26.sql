DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'recompute_attendance_day';

  v_new := replace(
    v_def,
    E'    v_net_minutes := LEAST(v_net_minutes, v_net_cap_minutes);\n\n    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE ''Asia/Hebron'')) >= 9 THEN',
    E'    IF v_legacy THEN\n      v_net_minutes := LEAST(v_net_minutes, v_net_cap_minutes);\n    END IF;\n\n    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE ''Asia/Hebron'')) >= 9 THEN'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'cap pattern not found';
  END IF;

  EXECUTE v_new;
END
$mig$;