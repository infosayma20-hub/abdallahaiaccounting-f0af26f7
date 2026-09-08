DO $mig$
DECLARE r record; def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('post_settlement_journal','create_payment_with_entry','create_mixed_voucher_atomic','create_cheque_lifecycle_event','create_cheque_offline','_payroll_post_payment')
      AND pg_get_functiondef(p.oid) LIKE '%''1160''%'
  LOOP
    def := replace(pg_get_functiondef(r.oid), '''1160''', '''2120''');
    EXECUTE def;
  END LOOP;
END
$mig$;