CREATE OR REPLACE FUNCTION public.assert_owner_scope(p_owner uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_owner IS NULL OR p_owner = v_uid THEN RETURN; END IF;
  IF p_owner = public.get_team_owner_id(v_uid) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'super_admin') THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.holding_members hm
    JOIN public.holding_companies hc ON hc.holding_id = hm.holding_id
    WHERE hm.auth_user_id = v_uid AND hc.owner_id = p_owner
  ) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.active_owner_context aoc WHERE aoc.auth_user_id = v_uid AND aoc.owner_id = p_owner) THEN RETURN; END IF;
  RAISE EXCEPTION 'غير مصرح: لا يمكن تنفيذ العملية على بيانات جهة أخرى' USING ERRCODE = '42501';
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.assert_owner_scope(uuid) TO authenticated, service_role;

DO $do$
DECLARE
  r RECORD;
  v_pos int;
  v_head text;
  v_body text;
  v_newbody text;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           split_part(pg_get_function_identity_arguments(p.oid), ' ', 1) AS arg,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND l.lanname = 'plpgsql'
      AND pg_get_function_identity_arguments(p.oid) ~ '^(p_user_id|p_owner_id|p_data_owner_id|p_data_owner) uuid'
      AND NOT (pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)')
      AND NOT (pg_get_functiondef(p.oid) ~* 'assert_owner_scope')
      AND p.proname NOT IN ('malaki_set_password', 'verify_task_password')
  LOOP
    v_pos := position('AS $function$' in r.def);
    IF v_pos = 0 THEN RAISE EXCEPTION 'no marker in %', r.proname; END IF;
    v_head := substr(r.def, 1, v_pos + 12);
    v_body := substr(r.def, v_pos + 13);
    v_newbody := regexp_replace(
      v_body,
      '(^|\n)([ \t]*)BEGIN[ \t]*(\r?\n)',
      E'\\1\\2BEGIN\\3\\2  PERFORM public.assert_owner_scope(' || r.arg || E');\\3',
      1, 1, 'i'
    );
    IF v_newbody = v_body THEN RAISE EXCEPTION 'patch failed for %', r.proname; END IF;
    EXECUTE v_head || v_newbody;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'patched % functions', v_count;
END;
$do$;