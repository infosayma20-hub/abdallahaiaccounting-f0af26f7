
DO $$
DECLARE
  v_batch text := 'final_pos_import_' || to_char(now(),'YYYYMMDD_HH24MISS');
  v_malaki uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_import uuid := 'fcbc3c51-8ef1-43f9-a642-422692234ca2';
  v_n int;
BEGIN
  -- ================= MALAKI: create POS cash customers sub-account =================
  INSERT INTO accounts(user_id, account_code, account_name, account_type, parent_code, is_active, is_system, nature, notes)
  VALUES (v_malaki, '11300000', 'عملاء نقاط البيع النقديون', 'asset', '1130', true, false, 'debit',
          'حساب فرعي تلقائي لمبيعات POS بدون عميل محدد')
  ON CONFLICT DO NOTHING;

  -- Redirect 1130 direct POS transactions (debit side: DR 1130 / CR 4100)
  INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
  SELECT v_batch, 'transaction.debit_account_code', t.id,
         jsonb_build_object('debit_account_code','1130','amount',t.amount,'description',t.description),
         jsonb_build_object('debit_account_code','11300000'),
         'POS cash sale posted to parent 1130 → redirected to cash customers sub-account', now()
  FROM transactions t
  WHERE t.user_id=v_malaki AND t.debit_account_code='1130' AND t.is_deleted=false
    AND t.description LIKE 'مبيعات نقطة البيع%';

  UPDATE transactions SET debit_account_code='11300000', updated_at=now()
   WHERE user_id=v_malaki AND debit_account_code='1130' AND is_deleted=false
     AND description LIKE 'مبيعات نقطة البيع%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Malaki: redirected % POS tx from 1130', v_n;

  -- Redirect 2180 wrong POS transactions (should have been cash customers)
  INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
  SELECT v_batch, 'transaction.debit_account_code', t.id,
         jsonb_build_object('debit_account_code','2180','amount',t.amount,'description',t.description),
         jsonb_build_object('debit_account_code','11300000'),
         'POS sale wrongly posted to 2180 (employee payable) → redirected to cash customers', now()
  FROM transactions t
  WHERE t.user_id=v_malaki AND t.debit_account_code='2180' AND t.is_deleted=false
    AND t.description LIKE 'مبيعات نقطة البيع%';

  UPDATE transactions SET debit_account_code='11300000', updated_at=now()
   WHERE user_id=v_malaki AND debit_account_code='2180' AND is_deleted=false
     AND description LIKE 'مبيعات نقطة البيع%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Malaki: redirected % POS tx from 2180', v_n;

  -- Handle reversal on 2180 (credit side)
  INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
  SELECT v_batch, 'transaction.credit_account_code', t.id,
         jsonb_build_object('credit_account_code','2180','amount',t.amount,'description',t.description),
         jsonb_build_object('credit_account_code','11300000'),
         'POS reversal on 2180 → redirected to cash customers', now()
  FROM transactions t
  WHERE t.user_id=v_malaki AND t.credit_account_code='2180' AND t.is_deleted=false
    AND t.description LIKE 'REV-POS%';

  UPDATE transactions SET credit_account_code='11300000', updated_at=now()
   WHERE user_id=v_malaki AND credit_account_code='2180' AND is_deleted=false
     AND description LIKE 'REV-POS%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Malaki: redirected % reversal tx from 2180', v_n;

  -- ================= IMPORT TENANT: create import-shipments payable sub-account =================
  INSERT INTO accounts(user_id, account_code, account_name, account_type, parent_code, is_active, is_system, nature, notes)
  VALUES (v_import, '21100999', 'دائنو شحنات الاستيراد', 'liability', '2110', true, false, 'credit',
          'حساب فرعي لتكاليف شحنات استيراد بدون مورد محدد')
  ON CONFLICT DO NOTHING;

  INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
  SELECT v_batch, 'transaction.credit_account_code', t.id,
         jsonb_build_object('credit_account_code','2110','amount',t.amount,'description',t.description),
         jsonb_build_object('credit_account_code','21100999'),
         'Import shipment cost posted to parent 2110 → redirected to import-shipments payable', now()
  FROM transactions t
  WHERE t.user_id=v_import AND t.credit_account_code='2110' AND t.is_deleted=false;

  UPDATE transactions SET credit_account_code='21100999', updated_at=now()
   WHERE user_id=v_import AND credit_account_code='2110' AND is_deleted=false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Import tenant: redirected % tx from 2110', v_n;
END $$;
