
DO $$
DECLARE
  v_owner uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_new_code text := '11302086';
  v_new_id uuid;
  v_count int := 0;
  r record;
BEGIN
  SELECT id INTO v_new_id FROM public.accounts
    WHERE user_id = v_owner AND account_code = v_new_code;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'الحساب الفرعي غير موجود';
  END IF;

  FOR r IN
    SELECT id, debit_account_code, credit_account_code,
           account_id_debit, account_id_credit
    FROM public.transactions
    WHERE user_id = v_owner
      AND is_deleted = false
      AND (debit_account_code = '1131' OR credit_account_code = '1131')
  LOOP
    IF r.debit_account_code = '1131' THEN
      UPDATE public.transactions
        SET debit_account_code = v_new_code,
            account_id_debit = v_new_id,
            updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.finance_integrity_fix_log(
        fix_batch, entity_type, entity_id, old_value, new_value, reason
      ) VALUES (
        'visa_wheels_1131_to_11302086_2026_07',
        'transaction', r.id,
        jsonb_build_object('debit_account_code','1131','account_id_debit',r.account_id_debit),
        jsonb_build_object('debit_account_code',v_new_code,'account_id_debit',v_new_id),
        'ترحيل حركات فيزا ويلز من الحساب الأب 1131 إلى الفرعي 11302086 - الدجاج الملكي'
      );
    ELSE
      UPDATE public.transactions
        SET credit_account_code = v_new_code,
            account_id_credit = v_new_id,
            updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.finance_integrity_fix_log(
        fix_batch, entity_type, entity_id, old_value, new_value, reason
      ) VALUES (
        'visa_wheels_1131_to_11302086_2026_07',
        'transaction', r.id,
        jsonb_build_object('credit_account_code','1131','account_id_credit',r.account_id_credit),
        jsonb_build_object('credit_account_code',v_new_code,'account_id_credit',v_new_id),
        'ترحيل حركات فيزا ويلز من الحساب الأب 1131 إلى الفرعي 11302086 - الدجاج الملكي'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Rerouted % transactions', v_count;
END $$;
