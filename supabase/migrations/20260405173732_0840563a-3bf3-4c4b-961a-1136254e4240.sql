
-- Step 1: Link order-sourced invoices to their transactions via idempotency_key
UPDATE invoices i
SET linked_transaction_id = t.id
FROM transactions t, orders o
WHERE i.source = 'qamar_brand'
  AND i.linked_transaction_id IS NULL
  AND o.invoice_id = i.id
  AND t.idempotency_key = 'INV-ORDER-' || o.id
  AND t.user_id = i.user_id;

-- Step 2: Update idempotency keys to new format for consistency
UPDATE transactions t
SET idempotency_key = 'INV-' || i.id
FROM invoices i
WHERE i.linked_transaction_id = t.id
  AND t.idempotency_key LIKE 'INV-ORDER-%';

-- Step 3: Fix transactions where invoice payment_method changed but transaction didn't follow
-- If invoice says آجل but transaction still has debit_account_code = 1110 (cash), fix it
UPDATE transactions t
SET 
  debit_account_code = '1130',
  transaction_type = 'sale_credit',
  payment_method = 'آجل',
  description = REPLACE(description, 'فاتورة مبيعات', 'فاتورة مبيعات آجل')
FROM invoices i
WHERE i.linked_transaction_id = t.id
  AND i.invoice_type = 'sale'
  AND i.payment_method = 'آجل'
  AND t.debit_account_code = '1110';

-- Step 4: Fix the reverse - invoice says نقدي but transaction has 1130
UPDATE transactions t
SET 
  debit_account_code = '1110',
  transaction_type = 'sale_cash',
  payment_method = 'نقدي'
FROM invoices i
WHERE i.linked_transaction_id = t.id
  AND i.invoice_type = 'sale'
  AND i.payment_method = 'نقدي'
  AND t.debit_account_code = '1130';
