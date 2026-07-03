
DO $$
DECLARE v_batch text := 'final_reversal_' || to_char(now(),'YYYYMMDD_HH24MISS');
BEGIN
  INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
  SELECT v_batch, 'transaction.credit_account_code', t.id,
         jsonb_build_object('credit_account_code','2180','amount',t.amount,'description',t.description),
         jsonb_build_object('credit_account_code','11300000'),
         'POS reversal wrongly credited 2180 → redirected to cash customers', now()
  FROM transactions t
  WHERE t.user_id='0b08eba6-c81a-4f6c-b371-e6e324016e73'
    AND t.credit_account_code='2180' AND t.is_deleted=false
    AND t.description LIKE '%عكس قيد%POS%';

  UPDATE transactions SET credit_account_code='11300000', updated_at=now()
   WHERE user_id='0b08eba6-c81a-4f6c-b371-e6e324016e73'
     AND credit_account_code='2180' AND is_deleted=false
     AND description LIKE '%عكس قيد%POS%';
END $$;
