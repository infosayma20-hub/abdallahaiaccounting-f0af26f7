DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.pos_return_v2(uuid,uuid,jsonb,text,text,text,numeric)'::regprocedure);
  -- keep employee hot-drink marker so returned drinks never touch stock
  d := replace(d, $a$CASE WHEN v_disp='damaged' THEN 'مرتجع تالف' END)$a$,
                  $a$CASE WHEN COALESCE(l.notes,'') LIKE '[EMPLOYEE_HOT_DRINK]%' THEN l.notes WHEN v_disp='damaged' THEN 'مرتجع تالف' END)$a$);
  d := replace(d, $a$WHERE rl.order_id = v_ret_id AND rl.return_disposition='damaged' AND rl.product_id IS NOT NULL AND rl.qty > 0;$a$,
                  $a$WHERE rl.order_id = v_ret_id AND rl.return_disposition='damaged' AND rl.product_id IS NOT NULL AND rl.qty > 0
       AND COALESCE(rl.notes,'') NOT LIKE '[EMPLOYEE_HOT_DRINK]%';$a$);
  d := replace(d, $a$WHERE rl.order_id = v_ret_id AND rl.return_disposition='damaged' AND rl.product_id IS NOT NULL;$a$,
                  $a$WHERE rl.order_id = v_ret_id AND rl.return_disposition='damaged' AND rl.product_id IS NOT NULL
       AND COALESCE(rl.notes,'') NOT LIKE '[EMPLOYEE_HOT_DRINK]%';$a$);
  -- serialize RET numbering per company
  d := replace(d, $a$  v_ret_no := 'RET-'$a$, $a$  PERFORM pg_advisory_xact_lock(hashtext('pos_return_no:' || v_owner::text));
  v_ret_no := 'RET-'$a$);
  IF position('EMPLOYEE_HOT_DRINK' in d) = 0 OR position('pg_advisory_xact_lock' in d) = 0 THEN
    RAISE EXCEPTION 'hardening patch did not apply';
  END IF;
  EXECUTE d;
END $m$;

-- Legacy return RPC trusted a client-supplied owner id; it is no longer called by the app.
REVOKE EXECUTE ON FUNCTION public.process_pos_return(uuid,uuid,uuid,jsonb,text,numeric,text,text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.process_pos_return(uuid,uuid,uuid,jsonb,text,numeric,text,text) IS 'DEPRECATED: replaced by pos_return_v2';