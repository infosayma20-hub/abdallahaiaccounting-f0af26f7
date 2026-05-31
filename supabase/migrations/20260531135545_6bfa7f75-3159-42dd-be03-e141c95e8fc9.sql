
-- Cleanup orphan tenant data accidentally created when the cashier
-- Obadashtieh@malaky.com (auth uid 1a51f3c9-b683-4750-ba10-09e383359b60)
-- ran the company setup wizard. He is an employee/cashier of the
-- existing Malaky tenant (owner 0b08eba6-c81a-4f6c-b371-e6e324016e73),
-- not a tenant owner. The wizard seeded 103 chart-of-accounts under his
-- own auth uid and stamped a stray company_name on his profile.
-- No transactions/invoices/contacts/products were created under that
-- stray tenant, so it is safe to delete.

DO $$
DECLARE
  v_uid uuid := '1a51f3c9-b683-4750-ba10-09e383359b60';
  v_txn integer;
  v_inv integer;
  v_con integer;
  v_prd integer;
BEGIN
  SELECT count(*) INTO v_txn FROM public.transactions WHERE user_id = v_uid;
  SELECT count(*) INTO v_inv FROM public.invoices     WHERE user_id = v_uid;
  SELECT count(*) INTO v_con FROM public.contacts     WHERE user_id = v_uid;
  SELECT count(*) INTO v_prd FROM public.products     WHERE user_id = v_uid;

  IF v_txn + v_inv + v_con + v_prd > 0 THEN
    RAISE EXCEPTION 'Refusing to clean orphan tenant for %: financial data exists (txn=%, inv=%, contacts=%, products=%)',
      v_uid, v_txn, v_inv, v_con, v_prd;
  END IF;

  -- Drop the orphan chart-of-accounts seeded by the wizard
  DELETE FROM public.accounts WHERE user_id = v_uid;

  -- Clear the stray company_name on the cashier's profile
  UPDATE public.profiles
     SET company_name = NULL
   WHERE user_id = v_uid;
END $$;
