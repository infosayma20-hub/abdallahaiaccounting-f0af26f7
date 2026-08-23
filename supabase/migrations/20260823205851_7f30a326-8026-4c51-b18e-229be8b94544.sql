DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_updated text;
BEGIN
  SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_mixed_voucher_atomic'
     AND p.pronargs = 20;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20-argument create_mixed_voucher_atomic function was not found';
  END IF;

  v_definition := pg_get_functiondef(v_oid);
  v_updated := replace(
    v_definition,
    E'        exchange_rate, foreign_amount, workshop_id, cost_center_id,\n        linked_transaction_id\n      ) VALUES (',
    E'        exchange_rate, foreign_amount, workshop_id, cost_center_id\n      ) VALUES ('
  );
  v_updated := replace(
    v_updated,
    E'        p_workshop_id, p_cost_center_id,\n        v_primary_tx_id\n      ) RETURNING id INTO v_endorsed_tx_id;',
    E'        p_workshop_id, p_cost_center_id\n      ) RETURNING id INTO v_endorsed_tx_id;'
  );

  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Expected endorsed-transaction insert pattern was not safely replaced';
  END IF;

  EXECUTE v_updated;
END;
$migration$;

GRANT EXECUTE ON FUNCTION public.create_mixed_voucher_atomic(uuid, text, uuid, text, date, text, numeric, text, text, text, numeric, text, jsonb, jsonb, text, uuid, uuid, uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_mixed_voucher_atomic(uuid, text, uuid, text, date, text, numeric, text, text, text, numeric, text, jsonb, jsonb, text, uuid, uuid, uuid, text, uuid[]) TO service_role;