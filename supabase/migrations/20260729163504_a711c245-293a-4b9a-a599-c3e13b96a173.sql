DO $mig$
DECLARE src text; nsrc text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_pos_shift_reconciliation';
  IF src IS NULL THEN RAISE EXCEPTION 'recon fn missing'; END IF;
  IF position('prepaid_received' in src) > 0 THEN RETURN; END IF;
  nsrc := src;

  -- 1) declare v_prepay
  IF position($a$  v_cash_curr     jsonb;$a$ in nsrc) = 0 THEN RAISE EXCEPTION 'anchor decl'; END IF;
  nsrc := replace(nsrc, $a$  v_cash_curr     jsonb;$a$, $a$  v_cash_curr     jsonb;
  v_prepay        jsonb;$a$);

  -- 2) compute + merge prepayments after the per-currency cash block
  IF position($a$        FROM currencies_seen c
    ) x;$a$ in nsrc) = 0 THEN RAISE EXCEPTION 'anchor cashblock'; END IF;
  nsrc := replace(nsrc, $a$        FROM currencies_seen c
    ) x;$a$, $a$        FROM currencies_seen c
    ) x;

  -- 6b) Prepaid deposits on scheduled credit orders (deposit line).
  WITH pre AS (
    SELECT UPPER(COALESCE(pp.currency, 'ILS')) AS cur,
           COALESCE(SUM(pp.amount) FILTER (WHERE pp.session_id = p_session_id
                                             AND pp.status <> 'cancelled'), 0) AS received,
           COALESCE(SUM(pp.amount) FILTER (WHERE pp.applied_session_id = p_session_id
                                             AND pp.status = 'applied'), 0) AS applied
      FROM public.pos_prepayments pp
     WHERE LOWER(COALESCE(pp.method, 'cash')) = 'cash'
       AND (pp.session_id = p_session_id OR pp.applied_session_id = p_session_id)
     GROUP BY 1
  )
  SELECT jsonb_object_agg(cur, jsonb_build_object('prepaid_received', received,
                                                  'prepaid_applied',  applied))
    INTO v_prepay
    FROM pre;

  v_cash_curr := COALESCE(v_cash_curr, '{}'::jsonb);
  v_prepay    := COALESCE(v_prepay,    '{}'::jsonb);

  SELECT jsonb_object_agg(k.key,
           COALESCE(v_cash_curr -> k.key, '{}'::jsonb)
           || jsonb_build_object(
                'prepaid_received', COALESCE((v_prepay -> k.key ->> 'prepaid_received')::numeric, 0),
                'prepaid_applied',  COALESCE((v_prepay -> k.key ->> 'prepaid_applied')::numeric, 0)))
    INTO v_cash_curr
    FROM (
      SELECT jsonb_object_keys(v_cash_curr) AS key
      UNION
      SELECT jsonb_object_keys(v_prepay)
    ) k;$a$);

  -- 3) ILS expected formula
  IF position($a$                 + COALESCE((v_cash_curr -> 'ILS' ->> 'fx_adjustment_foreign')::numeric, 0)
               ELSE$a$ in nsrc) = 0 THEN RAISE EXCEPTION 'anchor ils'; END IF;
  nsrc := replace(nsrc, $a$                 + COALESCE((v_cash_curr -> 'ILS' ->> 'fx_adjustment_foreign')::numeric, 0)
               ELSE$a$, $a$                 + COALESCE((v_cash_curr -> 'ILS' ->> 'fx_adjustment_foreign')::numeric, 0)
                 + COALESCE((v_cash_curr -> 'ILS' ->> 'prepaid_received')::numeric, 0)
                 - COALESCE((v_cash_curr -> 'ILS' ->> 'prepaid_applied')::numeric, 0)
               ELSE$a$);

  -- 4) foreign expected formula
  IF position($a$                 + COALESCE((v_cash_curr -> k.key ->> 'fx_adjustment_foreign')::numeric, 0)
             END AS expected$a$ in nsrc) = 0 THEN RAISE EXCEPTION 'anchor fx'; END IF;
  nsrc := replace(nsrc, $a$                 + COALESCE((v_cash_curr -> k.key ->> 'fx_adjustment_foreign')::numeric, 0)
             END AS expected$a$, $a$                 + COALESCE((v_cash_curr -> k.key ->> 'fx_adjustment_foreign')::numeric, 0)
                 + COALESCE((v_cash_curr -> k.key ->> 'prepaid_received')::numeric, 0)
                 - COALESCE((v_cash_curr -> k.key ->> 'prepaid_applied')::numeric, 0)
             END AS expected$a$);

  -- 5) expose in result
  IF position($a$    'expected_cash',    COALESCE(v_expected,  '{}'::jsonb),$a$ in nsrc) = 0 THEN RAISE EXCEPTION 'anchor result'; END IF;
  nsrc := replace(nsrc, $a$    'expected_cash',    COALESCE(v_expected,  '{}'::jsonb),$a$, $a$    'expected_cash',    COALESCE(v_expected,  '{}'::jsonb),
    'prepayments',      COALESCE(v_prepay,    '{}'::jsonb),$a$);

  EXECUTE nsrc;
END $mig$;