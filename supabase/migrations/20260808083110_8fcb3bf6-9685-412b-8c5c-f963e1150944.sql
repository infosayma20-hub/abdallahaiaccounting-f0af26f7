CREATE OR REPLACE FUNCTION public.get_contacts_balances_bulk(p_user_id uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_currency text DEFAULT NULL::text)
 RETURNS TABLE(contact_id uuid, balance numeric, total_debit numeric, total_credit numeric, last_transaction_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH tx AS (
    SELECT t.id, t.debit_account_code, t.credit_account_code, t.contact_id, t.amount, t.transaction_date
    FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.is_deleted = false
      AND t.transaction_date <= p_as_of_date
      AND (p_currency IS NULL OR t.currency = p_currency)
  ),
  sides AS (
    SELECT id AS tx_id, 'd'::text AS side, debit_account_code AS account_code,
           amount AS debit, 0::numeric AS credit, contact_id, transaction_date
    FROM tx WHERE debit_account_code IS NOT NULL
    UNION ALL
    SELECT id, 'c', credit_account_code, 0::numeric, amount, contact_id, transaction_date
    FROM tx WHERE credit_account_code IS NOT NULL
  ),
  ctc AS (
    SELECT c.id, NULLIF(c.linked_account_code, '') AS acc
    FROM public.contacts c
    WHERE c.user_id = p_user_id
  ),
  m_acc AS (
    SELECT ctc.id AS cid, s.tx_id, s.side, s.debit, s.credit, s.transaction_date
    FROM ctc JOIN sides s ON s.account_code = ctc.acc
    WHERE ctc.acc IS NOT NULL
  ),
  m_con AS (
    SELECT ctc.id AS cid, s.tx_id, s.side, s.debit, s.credit, s.transaction_date
    FROM ctc JOIN sides s ON s.contact_id = ctc.id
    WHERE (s.account_code LIKE '113%'
       OR s.account_code LIKE '211%'
       OR s.account_code LIKE '1146%'
       OR s.account_code LIKE '2180%')
      -- Do not attribute a leg posted on ANOTHER contact's dedicated
      -- sub-account (e.g. merge / balance-transfer journals) to this contact.
      AND NOT EXISTS (
        SELECT 1 FROM ctc o WHERE o.acc = s.account_code AND o.id <> ctc.id
      )
  ),
  merged AS (
    SELECT * FROM m_acc UNION SELECT * FROM m_con
  ),
  agg AS (
    SELECT cid, SUM(debit) AS debit, SUM(credit) AS credit, MAX(transaction_date) AS last_date
    FROM merged GROUP BY cid
  )
  SELECT
    ctc.id AS contact_id,
    (COALESCE(agg.debit, 0) - COALESCE(agg.credit, 0))::numeric AS balance,
    COALESCE(agg.debit, 0)::numeric AS total_debit,
    COALESCE(agg.credit, 0)::numeric AS total_credit,
    agg.last_date AS last_transaction_date
  FROM ctc
  LEFT JOIN agg ON agg.cid = ctc.id;
$function$;