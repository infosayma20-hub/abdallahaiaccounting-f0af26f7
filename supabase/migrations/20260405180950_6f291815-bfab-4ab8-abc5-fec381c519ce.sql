-- Fix orphaned transactions: link them back to invoices using idempotency_key
UPDATE invoices i
SET linked_transaction_id = t.id
FROM transactions t
WHERE i.linked_transaction_id IS NULL
  AND t.idempotency_key = 'INV-' || i.id::text
  AND t.is_deleted = false;

-- Fix transaction debit codes for invoices whose payment_method changed to آجل but transaction still has old code
UPDATE transactions t
SET debit_account_code = '1130',
    transaction_type = CASE 
      WHEN t.transaction_type LIKE 'sale%' THEN 'sale_credit'
      ELSE t.transaction_type
    END,
    payment_method = 'آجل'
FROM invoices i
WHERE t.idempotency_key = 'INV-' || i.id::text
  AND t.is_deleted = false
  AND i.payment_method = 'آجل'
  AND i.invoice_type = 'sale'
  AND t.debit_account_code != '1130';

-- Fix transaction debit codes for purchase invoices whose payment_method changed to آجل
UPDATE transactions t
SET credit_account_code = '2110',
    transaction_type = CASE 
      WHEN t.transaction_type LIKE 'purchase%' THEN 'purchase_credit'
      ELSE t.transaction_type
    END,
    payment_method = 'آجل'
FROM invoices i
WHERE t.idempotency_key = 'INV-' || i.id::text
  AND t.is_deleted = false
  AND i.payment_method = 'آجل'
  AND i.invoice_type = 'purchase'
  AND t.credit_account_code != '2110';