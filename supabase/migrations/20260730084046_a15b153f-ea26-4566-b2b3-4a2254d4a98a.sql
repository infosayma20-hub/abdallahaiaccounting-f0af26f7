DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  SELECT p.oid INTO r
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_sale_invoice_atomic';

  IF r.oid IS NOT NULL THEN
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(
      v_def,
      E'  INSERT INTO public.transactions (',
      E'  IF v_debit_code IN (\'1130\',\'1131\') AND p_contact_id IS NOT NULL THEN\n    v_debit_code := public.resolve_postable_account(p_user_id, \'1130\', p_contact_id, p_contact_name, \'عميل\');\n  END IF;\n\n  INSERT INTO public.transactions ('
    );
    EXECUTE v_def;
  END IF;
END;
$$;