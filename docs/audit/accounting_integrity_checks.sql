-- =====================================================================
-- Accounting Integrity Daily Checks (Phase 1A)
-- Run as DBA/admin. Each query returns rows ONLY when something is off.
-- Last reviewed: 2026-05-17
-- =====================================================================

-- 1) Posted invoices (sale/purchase) with no journal transaction at all.
SELECT i.user_id, i.invoice_number, i.invoice_type, i.total_amount, i.created_at
FROM public.invoices i
WHERE i.status NOT IN ('draft','cancelled')
  AND COALESCE(i.is_voided, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.user_id = i.user_id
      AND t.reference = i.invoice_number
      AND COALESCE(t.is_deleted, false) = false
  );

-- 2) Orphan transactions whose reference looks like an invoice
--    but no matching invoice exists.
SELECT t.id, t.user_id, t.reference, t.amount, t.transaction_date
FROM public.transactions t
WHERE t.reference ~ '^(INV|PO|REP|REC)-'
  AND COALESCE(t.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.user_id = t.user_id AND i.invoice_number = t.reference
  );

-- 3) Trial balance unbalanced per tenant (debit != credit).
SELECT user_id,
       SUM(CASE WHEN debit_account_code  IS NOT NULL THEN amount ELSE 0 END) AS total_debit,
       SUM(CASE WHEN credit_account_code IS NOT NULL THEN amount ELSE 0 END) AS total_credit
FROM public.transactions
WHERE COALESCE(is_deleted, false) = false
GROUP BY user_id
HAVING ABS(SUM(CASE WHEN debit_account_code  IS NOT NULL THEN amount ELSE 0 END)
         - SUM(CASE WHEN credit_account_code IS NOT NULL THEN amount ELSE 0 END)) > 0.05;

-- 4) Duplicate invoice numbers within the same tenant + type.
SELECT user_id, invoice_type, invoice_number, COUNT(*) AS dup_count
FROM public.invoices
GROUP BY user_id, invoice_type, invoice_number
HAVING COUNT(*) > 1;

-- 5) invoice_sequences lagging behind actual max used.
SELECT s.user_id, s.invoice_type, s.year, s.last_number, m.max_used
FROM public.invoice_sequences s
JOIN LATERAL (
  SELECT MAX(NULLIF(regexp_replace(split_part(invoice_number,'-',3),'\D','','g'),'')::int) AS max_used
  FROM public.invoices i
  WHERE i.user_id = s.user_id
    AND i.invoice_type = s.invoice_type
    AND i.invoice_number ~ ('^[A-Z]+-'||s.year::text||'-[0-9]+$')
) m ON TRUE
WHERE m.max_used IS NOT NULL AND m.max_used > s.last_number;

-- 6) Posted vouchers without any linked transaction (true zero after Phase 1A guard).
SELECT v.id, v.ref_number, v.type, v.amount
FROM public.vouchers v
WHERE v.status = 'posted'
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.user_id = v.user_id
      AND (t.reference = v.ref_number OR t.id = v.linked_transaction_id)
      AND COALESCE(t.is_deleted, false) = false
  );

-- 7) Cancelled invoices whose stock movements were NEVER reversed.
--    After Phase 1A trigger, new cancellations auto-reverse; this lists legacy pending repair.
SELECT i.user_id, i.invoice_number, i.invoice_type,
       SUM(CASE WHEN sm.movement_type::text = 'صادر' THEN -sm.quantity ELSE sm.quantity END) AS net_qty
FROM public.invoices i
JOIN public.stock_movements sm
  ON sm.reference_id = i.id
 AND sm.reference_type IN ('invoice','invoice_void')
WHERE (i.status = 'cancelled' OR COALESCE(i.is_voided,false) = true)
GROUP BY i.user_id, i.invoice_number, i.invoice_type
HAVING SUM(CASE WHEN sm.movement_type::text = 'صادر' THEN -sm.quantity ELSE sm.quantity END) <> 0;

-- 8) contacts.current_balance vs ledger (1130 AR).
SELECT c.user_id, c.contact_name, c.current_balance,
       (SELECT COALESCE(SUM(CASE WHEN t.debit_account_code LIKE '113%' THEN t.amount ELSE -t.amount END), 0)
        FROM public.transactions t
        WHERE t.user_id = c.user_id
          AND t.contact_id = c.id
          AND COALESCE(t.is_deleted, false) = false
          AND (t.debit_account_code LIKE '113%' OR t.credit_account_code LIKE '113%')
       ) AS ledger_balance
FROM public.contacts c
WHERE c.contact_type IN ('customer','both');

-- 9) Posted product invoices without any stock movement.
SELECT DISTINCT i.user_id, i.invoice_number, i.invoice_type
FROM public.invoices i
JOIN public.invoice_items ii ON ii.invoice_id = i.id
JOIN public.products p ON p.id = ii.product_id AND p.product_type = 'product'
WHERE i.status NOT IN ('draft','cancelled')
  AND COALESCE(i.is_voided, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id = i.id AND sm.reference_type = 'invoice'
  );