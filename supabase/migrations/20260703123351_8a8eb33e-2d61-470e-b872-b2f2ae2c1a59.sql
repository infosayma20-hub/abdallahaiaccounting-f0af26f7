
CREATE OR REPLACE FUNCTION public.audit_contact_account_integrity(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, issue_type text, entity_key text, contact_name text, contact_type text,
  account_code text, parent_code text, linked_account_code text,
  transaction_count bigint, total_amount numeric, details jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Issue A: Duplicate active accounts for same name across AR and AP
  -- Excludes: inactive accounts, and contacts marked as 'عميل ومورد' (legitimate dual role)
  RETURN QUERY
  SELECT
    a.user_id, 'duplicate_across_roots'::text, a.account_name, a.account_name,
    NULL::text, NULL::text, NULL::text, NULL::text, COUNT(*)::bigint, NULL::numeric,
    jsonb_build_object('accounts', jsonb_agg(jsonb_build_object('code', a.account_code, 'parent', a.parent_code)))
  FROM public.accounts a
  WHERE a.parent_code IN ('1130','2110')
    AND a.is_active
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    -- Exclude dual-role contacts (legitimate)
    AND NOT EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.user_id = a.user_id
        AND c.contact_name = a.account_name
        AND c.contact_type IN ('عميل ومورد','customer_supplier','both')
    )
  GROUP BY a.user_id, a.account_name
  HAVING COUNT(DISTINCT a.parent_code) > 1;

  -- Issue B: Contact linked to wrong root
  RETURN QUERY
  SELECT
    c.user_id, 'contact_wrong_root'::text, c.id::text, c.contact_name, c.contact_type,
    c.linked_account_code, LEFT(c.linked_account_code, 4), c.linked_account_code,
    0::bigint, NULL::numeric,
    jsonb_build_object('should_be_under', CASE
      WHEN c.contact_type IN ('مورد','supplier','vendor') THEN '2110'
      WHEN c.contact_type IN ('عميل','customer','client') THEN '1130'
      WHEN c.contact_type IN ('موظف','employee') THEN '2180' END)
  FROM public.contacts c
  WHERE c.linked_account_code IS NOT NULL AND c.is_active
    AND (p_user_id IS NULL OR c.user_id = p_user_id)
    AND ((c.contact_type IN ('مورد','supplier','vendor') AND c.linked_account_code LIKE '113%')
      OR (c.contact_type IN ('عميل','customer','client') AND c.linked_account_code LIKE '211%'));

  -- Issue C: Transactions on parent root when children exist
  RETURN QUERY
  SELECT
    t.user_id, 'transaction_on_parent_root'::text, t.transaction_type,
    NULL::text, NULL::text,
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','1146') THEN t.debit_account_code ELSE t.credit_account_code END,
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','1146') THEN t.debit_account_code ELSE t.credit_account_code END,
    NULL::text, COUNT(*)::bigint, SUM(t.amount),
    jsonb_build_object('sample_refs', (array_agg(t.reference))[1:5], 'has_contact_id', bool_or(t.contact_id IS NOT NULL))
  FROM public.transactions t
  WHERE NOT t.is_deleted
    AND (p_user_id IS NULL OR t.user_id = p_user_id)
    AND (t.debit_account_code IN ('1130','2110','2180','1146')
         OR t.credit_account_code IN ('1130','2110','2180','1146'))
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.user_id = t.user_id AND a.is_active
        AND a.parent_code = (CASE WHEN t.debit_account_code IN ('1130','2110','2180','1146') THEN t.debit_account_code ELSE t.credit_account_code END)
    )
  GROUP BY t.user_id, t.transaction_type,
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','1146') THEN t.debit_account_code ELSE t.credit_account_code END;
END;
$function$;
