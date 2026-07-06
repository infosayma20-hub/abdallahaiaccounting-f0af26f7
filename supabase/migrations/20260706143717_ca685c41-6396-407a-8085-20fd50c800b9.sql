
DO $$
DECLARE
  v_owner uuid;
  v_fixed_debit int := 0;
  v_fixed_credit int := 0;
BEGIN
  SELECT user_id INTO v_owner FROM contacts WHERE id='043f970a-55a3-4814-a41b-82b769b1e53e';

  -- 1) Fix debit side: 1131 (parent AR) → contact's own AR sub-account
  UPDATE transactions t
     SET debit_account_code = a.account_code,
         updated_at = now()
    FROM contacts c
    JOIN accounts a ON a.contact_id=c.id AND a.parent_code='1130' AND a.user_id=c.user_id
   WHERE t.contact_id = c.id
     AND c.user_id = v_owner
     AND COALESCE(t.is_deleted,false)=false
     AND t.debit_account_code='1131';
  GET DIAGNOSTICS v_fixed_debit = ROW_COUNT;

  -- 2) Fix credit side: 1131 (parent AR) → contact's own AR sub-account
  UPDATE transactions t
     SET credit_account_code = a.account_code,
         updated_at = now()
    FROM contacts c
    JOIN accounts a ON a.contact_id=c.id AND a.parent_code='1130' AND a.user_id=c.user_id
   WHERE t.contact_id = c.id
     AND c.user_id = v_owner
     AND COALESCE(t.is_deleted,false)=false
     AND t.credit_account_code='1131';
  GET DIAGNOSTICS v_fixed_credit = ROW_COUNT;

  -- 3) Fix wrong AP account on customer receipts: credit 21100006 → contact's AR sub
  UPDATE transactions t
     SET credit_account_code = a.account_code,
         updated_at = now()
    FROM contacts c
    JOIN accounts a ON a.contact_id=c.id AND a.parent_code='1130' AND a.user_id=c.user_id
   WHERE t.contact_id = c.id
     AND c.user_id = v_owner
     AND COALESCE(t.is_deleted,false)=false
     AND t.credit_account_code='21100006';

  -- 4) Recompute contacts.current_balance for this tenant from ledger truth
  UPDATE contacts c
     SET current_balance = COALESCE(x.ar,0) - COALESCE(x.ap,0),
         updated_at = now()
    FROM (
      SELECT c2.id AS cid,
        SUM(CASE WHEN t.debit_account_code  LIKE '113%' THEN t.amount ELSE 0 END)
       -SUM(CASE WHEN t.credit_account_code LIKE '113%' THEN t.amount ELSE 0 END) AS ar,
        SUM(CASE WHEN t.credit_account_code LIKE '211%' THEN t.amount ELSE 0 END)
       -SUM(CASE WHEN t.debit_account_code  LIKE '211%' THEN t.amount ELSE 0 END) AS ap
      FROM contacts c2
      LEFT JOIN transactions t ON t.contact_id=c2.id AND COALESCE(t.is_deleted,false)=false
      WHERE c2.user_id = v_owner
      GROUP BY c2.id
    ) x
   WHERE c.id = x.cid;

  RAISE NOTICE 'Fixed debit rows: %, credit rows: %', v_fixed_debit, v_fixed_credit;
END $$;
