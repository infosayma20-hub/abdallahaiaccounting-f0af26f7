DO $$
DECLARE
  v_old uuid;
  v_new uuid;
BEGIN
  SELECT id INTO v_old FROM public.accounts
   WHERE user_id='0b08eba6-c81a-4f6c-b371-e6e324016e73' AND account_code='21802';
  SELECT id INTO v_new FROM public.accounts
   WHERE user_id='0b08eba6-c81a-4f6c-b371-e6e324016e73' AND account_code='21803';
  IF v_old IS NULL OR v_new IS NULL THEN
    RAISE EXCEPTION 'Sami Jamhour accounts not found';
  END IF;

  UPDATE public.transactions
     SET debit_account_code='21803',
         account_id_debit = CASE WHEN account_id_debit = v_old THEN v_new ELSE account_id_debit END
   WHERE debit_account_code='21802';

  UPDATE public.transactions
     SET credit_account_code='21803',
         account_id_credit = CASE WHEN account_id_credit = v_old THEN v_new ELSE account_id_credit END
   WHERE credit_account_code='21802';

  UPDATE public.voucher_lines SET account_code='21803' WHERE account_code='21802';

  UPDATE public.accounts
     SET is_active=false,
         account_name='ذمم سامي جمهور (مدمج → 21803)',
         notes = COALESCE(notes,'') || ' | مدمج مع 21803 بتاريخ ' || now()::date,
         updated_at = now()
   WHERE id = v_old;
END $$;