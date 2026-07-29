DO $mig$
DECLARE src text; nsrc text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_pos_shift_reconciliation';
  IF position($a$SELECT tr.id, tr.terminal_code, tr.terminal_name$a$ in src) = 0 THEN RETURN; END IF;
  nsrc := replace(src, $a$SELECT tr.id, tr.terminal_code, tr.terminal_name$a$, $a$SELECT tr.id, tr.name AS terminal_name$a$);
  EXECUTE nsrc;
END $mig$;