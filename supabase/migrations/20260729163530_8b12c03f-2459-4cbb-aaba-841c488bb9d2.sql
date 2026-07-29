DO $mig$
DECLARE src text; nsrc text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_pos_shift_reconciliation';
  IF position($a$SELECT br.id, br.name, br.code$a$ in src) = 0 THEN RETURN; END IF;
  nsrc := replace(src, $a$SELECT br.id, br.name, br.code$a$, $a$SELECT br.id, br.name, br.branch_code AS code$a$);
  EXECUTE nsrc;
END $mig$;