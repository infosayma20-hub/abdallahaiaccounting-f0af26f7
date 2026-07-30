DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_invoice_with_entry'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(
      v_def,
      E'  PERFORM public._fc_validate_postable_account(p_user_id, v_debit_code);',
      E'  IF p_payment_method NOT IN (\'نقدي\',\'بنك\',\'شيك\') AND p_contact_id IS NOT NULL THEN\n    IF p_invoice_type = \'purchase\' THEN\n      v_credit_code := public.resolve_postable_account(p_user_id, \'2110\', p_contact_id, p_contact_name, \'مورد\');\n    ELSE\n      v_debit_code := public.resolve_postable_account(p_user_id, \'1130\', p_contact_id, p_contact_name, \'عميل\');\n    END IF;\n  END IF;\n\n  PERFORM public._fc_validate_postable_account(p_user_id, v_debit_code);'
    );
    EXECUTE v_def;
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  SELECT p.oid INTO r
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_mixed_voucher_atomic';

  IF r.oid IS NOT NULL THEN
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(
      v_def,
      E'  IF p_cash_amount > 0 THEN\n    PERFORM public._fc_validate_postable_account(p_user_id, v_cash_acct);',
      E'  IF p_contact_id IS NOT NULL AND p_employee_id IS NULL THEN\n    v_contact_acct := public.resolve_postable_account(\n      p_user_id,\n      CASE WHEN p_kind = \'receipt\' THEN \'1130\' ELSE \'2110\' END,\n      p_contact_id,\n      p_contact_name,\n      CASE WHEN p_kind = \'receipt\' THEN \'عميل\' ELSE \'مورد\' END\n    );\n  END IF;\n\n  IF p_cash_amount > 0 THEN\n    PERFORM public._fc_validate_postable_account(p_user_id, v_cash_acct);'
    );
    EXECUTE v_def;
  END IF;
END;
$$;