-- Link existing payment vouchers to their transactions
UPDATE vouchers v
SET linked_transaction_id = sub.txn_id
FROM (
  SELECT DISTINCT ON (v2.id) v2.id as voucher_id, t.id as txn_id
  FROM vouchers v2
  JOIN transactions t ON v2.description = t.description
    AND v2.date::date = t.transaction_date::date
    AND v2.amount = t.amount
    AND v2.user_id = t.user_id
  WHERE v2.linked_transaction_id IS NULL
    AND v2.type = 'payment'
  ORDER BY v2.id, t.created_at DESC
) sub
WHERE v.id = sub.voucher_id;

-- Cancel payment vouchers whose linked transactions are deleted
UPDATE vouchers v
SET status = 'cancelled'
FROM transactions t
WHERE v.linked_transaction_id = t.id
  AND t.is_deleted = true
  AND v.status != 'cancelled';