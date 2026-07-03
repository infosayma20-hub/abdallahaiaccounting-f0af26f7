
DO $$
DECLARE
  v_owner uuid := '3358a87e-0a2e-4ad1-88c0-1e9ff8fda482';
  v_maslakh_id uuid;
  v_yadak_id uuid;
  v_munir_id uuid;
  v_count int := 0;
  r record;
  v_new_code text;
  v_new_id uuid;
  v_side text;
BEGIN
  -- 1) Create supplier sub-accounts
  INSERT INTO public.accounts(user_id, account_code, account_name, account_type, parent_code, currency, nature)
  VALUES 
    (v_owner, '21100006', 'ذمة مورد مسلخ الوسيم', 'فرعي', '2110', 'شيكل', 'credit'),
    (v_owner, '21100007', 'ذمة مورد يدك', 'فرعي', '2110', 'شيكل', 'credit')
  ON CONFLICT (user_id, account_code) DO NOTHING;

  SELECT id INTO v_maslakh_id FROM public.accounts WHERE user_id=v_owner AND account_code='21100006';
  SELECT id INTO v_yadak_id FROM public.accounts WHERE user_id=v_owner AND account_code='21100007';
  SELECT id INTO v_munir_id FROM public.accounts WHERE user_id=v_owner AND account_code='21100001';

  -- 2) Loop stuck transactions and reroute
  FOR r IN
    SELECT t.id, t.debit_account_code, t.credit_account_code,
           t.account_id_debit, t.account_id_credit, c.contact_name
    FROM public.transactions t
    JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.user_id = v_owner
      AND t.is_deleted = false
      AND (t.debit_account_code IN ('2110','2111','1130','1131')
           OR t.credit_account_code IN ('2110','2111','1130','1131'))
      AND c.contact_name IN ('ذمة مسلخ الوسيم','ذمة يدك','ذمة مورد منير المحيسن')
  LOOP
    IF r.contact_name = 'ذمة مسلخ الوسيم' THEN
      v_new_code := '21100006'; v_new_id := v_maslakh_id;
    ELSIF r.contact_name = 'ذمة يدك' THEN
      v_new_code := '21100007'; v_new_id := v_yadak_id;
    ELSE
      v_new_code := '21100001'; v_new_id := v_munir_id;
    END IF;

    IF r.debit_account_code IN ('2110','2111','1130','1131') THEN
      v_side := 'debit';
      UPDATE public.transactions
        SET debit_account_code = v_new_code, account_id_debit = v_new_id, updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason)
      VALUES ('abu_raed_parent_reroute_2026_07','transaction', r.id,
        jsonb_build_object('debit_account_code', r.debit_account_code, 'account_id_debit', r.account_id_debit),
        jsonb_build_object('debit_account_code', v_new_code, 'account_id_debit', v_new_id),
        format('ترحيل من الحساب الأب إلى الفرعي المطابق للجهة %s', r.contact_name));
    ELSE
      v_side := 'credit';
      UPDATE public.transactions
        SET credit_account_code = v_new_code, account_id_credit = v_new_id, updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason)
      VALUES ('abu_raed_parent_reroute_2026_07','transaction', r.id,
        jsonb_build_object('credit_account_code', r.credit_account_code, 'account_id_credit', r.account_id_credit),
        jsonb_build_object('credit_account_code', v_new_code, 'account_id_credit', v_new_id),
        format('ترحيل من الحساب الأب إلى الفرعي المطابق للجهة %s', r.contact_name));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Rerouted % Abu Raed transactions', v_count;
END $$;
