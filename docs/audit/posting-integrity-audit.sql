-- Document Posting Integrity Audit (read-only)
-- Run these in Supabase SQL editor. None of them mutate data.

-- 1) Posted receipt vouchers without a linked transaction
SELECT id, voucher_number, contact_name, amount, payment_date
FROM receipt_vouchers
WHERE status = 'posted' AND linked_transaction_id IS NULL
ORDER BY payment_date DESC;

-- 2) Posted payment vouchers without a linked transaction
SELECT id, voucher_number, description, amount, date
FROM vouchers
WHERE status = 'posted' AND linked_transaction_id IS NULL
ORDER BY date DESC;

-- 3) Sales invoices that look posted but have no ledger link
SELECT id, invoice_number, customer_name, total_amount, invoice_date, status
FROM invoices
WHERE status::text IN ('posted','sent','paid','partial','approved')
  AND linked_transaction_id IS NULL
ORDER BY invoice_date DESC;

-- 4) Purchase invoices posted but missing ledger link
SELECT id, invoice_number, supplier_name, total_amount, invoice_date, status
FROM purchase_invoices
WHERE status::text NOT IN ('draft','cancelled')
  AND linked_transaction_id IS NULL
ORDER BY invoice_date DESC;

-- 5) Returns posted but missing journal entry link
SELECT id, return_number, status, total_amount, return_date
FROM returns
WHERE is_deleted = false
  AND status::text NOT IN ('draft','cancelled')
  AND journal_entry_id IS NULL
ORDER BY return_date DESC;

-- 6) Linked transactions that no longer exist (or are soft-deleted)
SELECT 'receipt_vouchers' AS doc, rv.id, rv.voucher_number
FROM receipt_vouchers rv
LEFT JOIN transactions t
  ON t.id = rv.linked_transaction_id AND t.is_deleted = false
WHERE rv.linked_transaction_id IS NOT NULL AND t.id IS NULL
UNION ALL
SELECT 'vouchers', v.id, v.voucher_number
FROM vouchers v
LEFT JOIN transactions t
  ON t.id = v.linked_transaction_id AND t.is_deleted = false
WHERE v.linked_transaction_id IS NOT NULL AND t.id IS NULL
UNION ALL
SELECT 'invoices', i.id, i.invoice_number
FROM invoices i
LEFT JOIN transactions t
  ON t.id = i.linked_transaction_id AND t.is_deleted = false
WHERE i.linked_transaction_id IS NOT NULL AND t.id IS NULL;

-- 7) Linked transaction contact / amount / date mismatch
SELECT rv.voucher_number, rv.contact_id AS doc_contact, t.contact_id AS tx_contact,
       rv.amount AS doc_amount, t.amount AS tx_amount,
       rv.payment_date AS doc_date, t.transaction_date AS tx_date
FROM receipt_vouchers rv
JOIN transactions t ON t.id = rv.linked_transaction_id AND t.is_deleted = false
WHERE rv.contact_id IS DISTINCT FROM t.contact_id
   OR ROUND(rv.amount::numeric, 2) <> ROUND(t.amount::numeric, 2)
   OR rv.payment_date <> t.transaction_date;

-- 8) Wrong AR/AP account on receipt/payment vouchers
--    Customer receipts must credit 113% (AR). Supplier payments must debit 211% (AP).
SELECT rv.voucher_number, t.debit_account_code, t.credit_account_code
FROM receipt_vouchers rv
JOIN transactions t ON t.id = rv.linked_transaction_id AND t.is_deleted = false
WHERE rv.contact_id IS NOT NULL
  AND t.credit_account_code NOT LIKE '113%'
  AND t.credit_account_code NOT LIKE '2115%';

SELECT v.voucher_number, t.debit_account_code, t.credit_account_code
FROM vouchers v
JOIN transactions t ON t.id = v.linked_transaction_id AND t.is_deleted = false
WHERE v.contact_id IS NOT NULL
  AND t.debit_account_code NOT LIKE '211%'
  AND t.debit_account_code NOT LIKE '1146%';

-- 9) AR/AP per-contact mismatch:
--    contacts.current_balance vs ledger truth from transactions.
--    Ledger truth is what get_contact_balance(contact_id) returns.
SELECT c.id, c.contact_name,
       c.current_balance AS cached_balance,
       (SELECT (get_contact_balance(c.id)).balance) AS ledger_balance
FROM contacts c
WHERE c.is_deleted = false
  AND ABS(COALESCE(c.current_balance,0) - COALESCE((SELECT (get_contact_balance(c.id)).balance), 0)) > 0.01;