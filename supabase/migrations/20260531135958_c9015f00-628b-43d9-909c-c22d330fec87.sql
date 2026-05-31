
-- Cleanup orphan tenant data for the 7 employees who accidentally ran the
-- company-registration wizard while being linked to another tenant. None
-- of them have any financial data under the stray tenant, so it is safe to
-- delete. The wizard is now guarded server-side in setup-accounts so this
-- bug cannot recur.

DO $$
DECLARE
  v_victims uuid[] := ARRAY[
    '889a1d1a-9730-4a59-9cec-ce6a6b7e3094',
    '1e9efa73-5bac-4120-8ba9-b2f104711984',
    '3ea2d17c-3658-4890-8b21-998b3d25542f',
    '4589b5e5-43bb-4468-b144-4a05030165a6',
    '6c7b7ec3-6711-441a-b521-33a3a128ae6e',
    'd0babefa-0551-4dbf-8e74-cb75a2965258',
    'aeaa9508-199c-4bf1-8bb8-52c1bad77759'
  ]::uuid[];
  v_uid uuid;
  v_txn integer;
  v_inv integer;
  v_con integer;
  v_prd integer;
BEGIN
  FOREACH v_uid IN ARRAY v_victims LOOP
    SELECT count(*) INTO v_txn FROM public.transactions WHERE user_id = v_uid;
    SELECT count(*) INTO v_inv FROM public.invoices     WHERE user_id = v_uid;
    SELECT count(*) INTO v_con FROM public.contacts     WHERE user_id = v_uid;
    SELECT count(*) INTO v_prd FROM public.products     WHERE user_id = v_uid;
    IF v_txn + v_inv + v_con + v_prd > 0 THEN
      RAISE EXCEPTION 'Refusing to clean orphan tenant for %: financial data exists (txn=%, inv=%, contacts=%, products=%)',
        v_uid, v_txn, v_inv, v_con, v_prd;
    END IF;
  END LOOP;

  -- Drop the orphan chart-of-accounts seeded by the wizard
  DELETE FROM public.accounts WHERE user_id = ANY(v_victims);

  -- Drop the stray companies row (only 1 exists, under المعتصم)
  DELETE FROM public.companies WHERE owner_id = ANY(v_victims);

  -- Clear the stray company_name on the affected profiles so the wizard
  -- check `setup_completed`/`company_name` no longer treats them as
  -- partial-tenant rows.
  UPDATE public.profiles
     SET company_name = NULL
   WHERE user_id = ANY(v_victims);
END $$;
