
CREATE OR REPLACE FUNCTION public.portal_get_my_drawings(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(contact_name text, account_code text, is_liability boolean, transaction_id uuid, transaction_date date,
  description text, reference text, transaction_type text, debit numeric, credit numeric, running_balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_owner uuid;
  v_code text;
  v_name text;
  v_liab boolean;
  v_from date := COALESCE(p_from, date_trunc('year', CURRENT_DATE)::date);
  v_to   date := COALESCE(p_to, CURRENT_DATE);
BEGIN
  SELECT poc.contact_id, pu.user_id, COALESCE(poc.display_name, c.contact_name), c.linked_account_code
    INTO v_contact_id, v_owner, v_name, v_code
  FROM public.portal_owner_contacts poc
  JOIN public.malaki_portal_users pu ON pu.id = poc.portal_user_id
  JOIN public.contacts c ON c.id = poc.contact_id
  WHERE pu.auth_user_id = auth.uid() AND pu.is_active = true
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN;
  END IF;

  v_liab := COALESCE(v_code, '') LIKE '2%';

  RETURN QUERY
  WITH lines AS (
    SELECT t.id, t.transaction_date, t.description, t.reference, t.transaction_type, t.created_at,
           CASE
             WHEN t.debit_account_code = v_code THEN t.amount
             WHEN t.credit_account_code = v_code THEN 0
             WHEN t.contact_id = v_contact_id AND (t.debit_account_code LIKE '113%' OR t.debit_account_code LIKE '21%') THEN t.amount
             ELSE 0
           END AS debit,
           CASE
             WHEN t.credit_account_code = v_code THEN t.amount
             WHEN t.debit_account_code = v_code THEN 0
             WHEN t.contact_id = v_contact_id AND (t.credit_account_code LIKE '113%' OR t.credit_account_code LIKE '21%') THEN t.amount
             ELSE 0
           END AS credit
    FROM public.transactions t
    WHERE t.user_id = v_owner
      AND t.is_deleted = false
      AND t.transaction_date BETWEEN v_from AND v_to
      AND (
        t.contact_id = v_contact_id
        OR (t.contact_id IS NULL AND v_code IS NOT NULL
            AND v_code IN (t.debit_account_code, t.credit_account_code))
      )
  )
  SELECT v_name, v_code, v_liab, l.id, l.transaction_date, l.description, l.reference, l.transaction_type,
         l.debit, l.credit,
         SUM(CASE WHEN v_liab THEN l.credit - l.debit ELSE l.debit - l.credit END)
           OVER (ORDER BY l.transaction_date, l.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric
  FROM lines l
  WHERE l.debit <> 0 OR l.credit <> 0
  ORDER BY l.transaction_date, l.created_at;
END;
$$;
