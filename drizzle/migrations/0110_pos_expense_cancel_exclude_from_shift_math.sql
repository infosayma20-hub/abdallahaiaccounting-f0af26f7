DO $mig$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.get_pos_shift_reconciliation'::regproc) INTO d;
  n := replace(d, E'     WHERE shift_id = p_session_id\n       AND COALESCE(payment_method, ''cash'') = ''cash''\n  ),',
                  E'     WHERE shift_id = p_session_id\n       AND COALESCE(payment_method, ''cash'') = ''cash''\n       AND cancelled_at IS NULL\n  ),');
  IF n = d THEN RAISE EXCEPTION 'reconciliation pattern not found'; END IF;
  EXECUTE n;

  SELECT pg_get_functiondef('public.close_pos_session_atomic'::regproc) INTO d;
  n := replace(d, E'        FROM public.pos_expenses e\n        WHERE e.shift_id = v_row.id\n      ) exp ON true',
                  E'        FROM public.pos_expenses e\n        WHERE e.shift_id = v_row.id AND e.cancelled_at IS NULL\n      ) exp ON true');
  IF n = d THEN RAISE EXCEPTION 'close pattern not found'; END IF;
  EXECUTE n;
END $mig$;