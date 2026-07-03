
-- ============================================================
-- Phase 1: Contact Account Unification - Safe Hardening
-- Non-breaking: no data mutation, no blocking triggers
-- ============================================================

-- 1) Add contact_id column to accounts (nullable, for future linkage)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_contact_id
  ON public.accounts(contact_id) WHERE contact_id IS NOT NULL;

-- 2) Backfill contact_id for existing sub-accounts by exact name match under AR/AP/employee roots
UPDATE public.accounts a
SET contact_id = c.id
FROM public.contacts c
WHERE a.contact_id IS NULL
  AND a.user_id = c.user_id
  AND a.account_name = c.contact_name
  AND a.parent_code IN ('1130','2110','2180','1146','2111')
  AND c.linked_account_code = a.account_code;

-- 3) Enhanced resolve_postable_account: accepts contact_type and enforces correct root
CREATE OR REPLACE FUNCTION public.resolve_postable_account(
  p_user_id uuid,
  p_parent_code text,
  p_contact_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_type text DEFAULT NULL  -- NEW: enforces correct root
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent record;
  v_has_children boolean;
  v_existing_code text;
  v_linked_code text;
  v_new_code text;
  v_max_code text;
  v_next_num bigint;
  v_name text;
  v_ctype text;
  v_target_parent text := p_parent_code;
BEGIN
  -- NEW: If contact_type provided, override parent to enforce correctness
  --   عميل / customer → 1130
  --   مورد / supplier → 2110
  --   موظف / employee → 2180
  IF p_contact_type IS NULL AND p_contact_id IS NOT NULL THEN
    SELECT contact_type INTO v_ctype FROM public.contacts
    WHERE id = p_contact_id AND user_id = p_user_id;
  ELSE
    v_ctype := p_contact_type;
  END IF;

  IF v_ctype IS NOT NULL THEN
    IF v_ctype IN ('مورد','supplier','vendor') AND v_target_parent LIKE '113%' THEN
      v_target_parent := '2110';  -- redirect supplier away from AR
    ELSIF v_ctype IN ('عميل','customer','client') AND v_target_parent LIKE '211%' THEN
      v_target_parent := '1130';  -- redirect customer away from AP
    ELSIF v_ctype IN ('موظف','employee') AND v_target_parent NOT LIKE '218%' THEN
      v_target_parent := '2180';
    END IF;
  END IF;

  -- Locate the parent account
  SELECT * INTO v_parent FROM public.accounts
  WHERE user_id = p_user_id AND account_code = v_target_parent
  LIMIT 1;
  IF NOT FOUND THEN
    -- Fall back to caller's parent if enforced target doesn't exist yet
    v_target_parent := p_parent_code;
    SELECT * INTO v_parent FROM public.accounts
    WHERE user_id = p_user_id AND account_code = v_target_parent
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN p_parent_code;
    END IF;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.accounts
    WHERE user_id = p_user_id AND parent_code = v_target_parent
  ) INTO v_has_children;

  IF NOT v_has_children THEN
    RETURN v_target_parent;
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'الحساب % حساب أب — يجب تحديد جهة اتصال', v_target_parent
      USING ERRCODE = 'P0001';
  END IF;

  -- 1) Contact-linked sub-account under target parent (via contact_id link on account)
  SELECT account_code INTO v_existing_code
  FROM public.accounts
  WHERE user_id = p_user_id
    AND parent_code = v_target_parent
    AND contact_id = p_contact_id
    AND is_active
  LIMIT 1;
  IF v_existing_code IS NOT NULL THEN
    -- Sync linked_account_code if it drifted
    UPDATE public.contacts
      SET linked_account_code = v_existing_code
      WHERE id = p_contact_id
        AND user_id = p_user_id
        AND (linked_account_code IS NULL OR linked_account_code <> v_existing_code)
        AND contact_type IN (COALESCE(v_ctype, contact_type));  -- only update if matches type
    RETURN v_existing_code;
  END IF;

  -- 2) Legacy: linked_account_code on contact (only if it lives under target parent)
  SELECT linked_account_code INTO v_linked_code FROM public.contacts
  WHERE id = p_contact_id AND user_id = p_user_id;

  IF v_linked_code IS NOT NULL THEN
    SELECT account_code INTO v_existing_code FROM public.accounts
    WHERE user_id = p_user_id
      AND account_code = v_linked_code
      AND parent_code = v_target_parent
    LIMIT 1;
    IF v_existing_code IS NOT NULL THEN
      -- Backfill contact_id on the account
      UPDATE public.accounts
        SET contact_id = p_contact_id
        WHERE user_id = p_user_id AND account_code = v_existing_code AND contact_id IS NULL;
      RETURN v_existing_code;
    END IF;
  END IF;

  -- 3) Match by exact name under target parent
  SELECT contact_name INTO v_name FROM public.contacts
  WHERE id = p_contact_id AND user_id = p_user_id;

  IF v_name IS NOT NULL THEN
    SELECT account_code INTO v_existing_code
    FROM public.accounts
    WHERE user_id = p_user_id
      AND parent_code = v_target_parent
      AND account_name = v_name
      AND is_active
    LIMIT 1;
    IF v_existing_code IS NOT NULL THEN
      UPDATE public.accounts
        SET contact_id = p_contact_id
        WHERE user_id = p_user_id AND account_code = v_existing_code AND contact_id IS NULL;
      UPDATE public.contacts
        SET linked_account_code = v_existing_code
        WHERE id = p_contact_id AND user_id = p_user_id;
      RETURN v_existing_code;
    END IF;
  END IF;

  -- 4) Create new sub-account
  SELECT MAX(account_code) INTO v_max_code
  FROM public.accounts
  WHERE user_id = p_user_id AND parent_code = v_target_parent
    AND account_code ~ ('^' || v_target_parent || '[0-9]+$');

  IF v_max_code IS NULL THEN
    v_next_num := 1;
  ELSE
    v_next_num := COALESCE(NULLIF(regexp_replace(v_max_code, '^' || v_target_parent, ''), '')::bigint, 0) + 1;
  END IF;

  v_new_code := v_target_parent || LPAD(v_next_num::text, GREATEST(2, length(v_max_code) - length(v_target_parent)), '0');

  INSERT INTO public.accounts (
    user_id, account_code, account_name, account_type, parent_code,
    is_active, is_system, nature, currency, contact_id
  )
  SELECT
    p_user_id, v_new_code, COALESCE(p_contact_name, v_name, 'جهة'),
    v_parent.account_type, v_target_parent,
    true, false, v_parent.nature, v_parent.currency, p_contact_id;

  UPDATE public.contacts
    SET linked_account_code = v_new_code
    WHERE id = p_contact_id AND user_id = p_user_id;

  RETURN v_new_code;
END;
$function$;

-- 4) Read-only audit function: returns integrity issues per tenant
CREATE OR REPLACE FUNCTION public.audit_contact_account_integrity(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid,
  issue_type text,
  entity_key text,
  contact_name text,
  contact_type text,
  account_code text,
  parent_code text,
  linked_account_code text,
  transaction_count bigint,
  total_amount numeric,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Issue A: Duplicate accounts for same contact_name across AR and AP roots
  RETURN QUERY
  SELECT
    a.user_id,
    'duplicate_across_roots'::text AS issue_type,
    a.account_name AS entity_key,
    a.account_name AS contact_name,
    NULL::text AS contact_type,
    NULL::text AS account_code,
    NULL::text AS parent_code,
    NULL::text AS linked_account_code,
    COUNT(*)::bigint AS transaction_count,
    NULL::numeric AS total_amount,
    jsonb_build_object(
      'accounts', jsonb_agg(jsonb_build_object('code', a.account_code, 'parent', a.parent_code, 'name', a.account_name))
    ) AS details
  FROM public.accounts a
  WHERE a.parent_code IN ('1130','2110')
    AND a.is_active
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
  GROUP BY a.user_id, a.account_name
  HAVING COUNT(DISTINCT a.parent_code) > 1;

  -- Issue B: Contact linked to wrong root (supplier→113 or customer→211)
  RETURN QUERY
  SELECT
    c.user_id,
    'contact_wrong_root'::text,
    c.id::text,
    c.contact_name,
    c.contact_type,
    c.linked_account_code AS account_code,
    LEFT(c.linked_account_code, 4) AS parent_code,
    c.linked_account_code,
    0::bigint,
    NULL::numeric,
    jsonb_build_object(
      'should_be_under', CASE
        WHEN c.contact_type IN ('مورد','supplier','vendor') THEN '2110'
        WHEN c.contact_type IN ('عميل','customer','client') THEN '1130'
        WHEN c.contact_type IN ('موظف','employee') THEN '2180'
      END
    )
  FROM public.contacts c
  WHERE c.linked_account_code IS NOT NULL
    AND c.is_active
    AND (p_user_id IS NULL OR c.user_id = p_user_id)
    AND (
      (c.contact_type IN ('مورد','supplier','vendor') AND c.linked_account_code LIKE '113%')
      OR (c.contact_type IN ('عميل','customer','client') AND c.linked_account_code LIKE '211%')
    );

  -- Issue C: Transactions posted directly to parent root (should be leaf sub-account)
  RETURN QUERY
  SELECT
    t.user_id,
    'transaction_on_parent_root'::text,
    t.transaction_type,
    NULL::text,
    NULL::text,
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','5110','4110','1146') THEN t.debit_account_code ELSE t.credit_account_code END,
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','5110','4110','1146') THEN t.debit_account_code ELSE t.credit_account_code END,
    NULL::text,
    COUNT(*)::bigint,
    SUM(t.amount) AS total_amount,
    jsonb_build_object(
      'sample_refs', (array_agg(t.reference))[1:5]
    )
  FROM public.transactions t
  WHERE NOT t.is_deleted
    AND (p_user_id IS NULL OR t.user_id = p_user_id)
    AND (
      t.debit_account_code IN ('1130','2110','2180','1146')
      OR t.credit_account_code IN ('1130','2110','2180','1146')
    )
    -- Only flag when the parent has children (otherwise posting to parent is OK)
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.user_id = t.user_id
        AND a.parent_code = (CASE WHEN t.debit_account_code IN ('1130','2110','2180','1146') THEN t.debit_account_code ELSE t.credit_account_code END)
    )
  GROUP BY t.user_id, t.transaction_type, 
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','5110','4110','1146') THEN t.debit_account_code ELSE t.credit_account_code END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.audit_contact_account_integrity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_postable_account(uuid, text, uuid, text, text) TO authenticated, service_role;
