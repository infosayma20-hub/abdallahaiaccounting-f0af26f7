DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  v_old text := 'v_start timestamptz := (p_date::text || '' 00:00:00'')::timestamp AT TIME ZONE ''Asia/Hebron'';';
  v_new text := 'v_start timestamptz := (p_date::text || '' 06:00:00'')::timestamp AT TIME ZONE ''Asia/Hebron'';';
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'recompute_attendance_day'
    AND pg_get_function_identity_arguments(p.oid) = 'p_employee_id uuid, p_date date';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'recompute_attendance_day(uuid,date) was not found';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Expected attendance-day start boundary was not found';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END;
$migration$;