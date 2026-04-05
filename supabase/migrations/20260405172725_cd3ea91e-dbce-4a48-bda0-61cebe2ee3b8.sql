
-- Backfill transaction references from linked vouchers
UPDATE transactions t
SET reference = v.ref_number
FROM vouchers v
WHERE v.linked_transaction_id = t.id
  AND (t.reference IS NULL OR t.reference = '');

-- Backfill transaction references from linked receipt vouchers
UPDATE transactions t
SET reference = rv.receipt_number
FROM receipt_vouchers rv
WHERE rv.linked_transaction_id = t.id
  AND (t.reference IS NULL OR t.reference = '');
