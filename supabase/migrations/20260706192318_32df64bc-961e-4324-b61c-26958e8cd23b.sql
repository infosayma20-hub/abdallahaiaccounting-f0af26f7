
CREATE TABLE IF NOT EXISTS public._backup_hybrid_contacts_20260706 AS
SELECT * FROM public.contacts
WHERE contact_type IN ('عميل ومورد','customer_supplier');

CREATE TABLE IF NOT EXISTS public._backup_hybrid_accounts_20260706 AS
SELECT a.* FROM public.accounts a
WHERE a.contact_id IN (
  SELECT id FROM public.contacts WHERE contact_type IN ('عميل ومورد','customer_supplier')
);

CREATE TABLE IF NOT EXISTS public._backup_hybrid_transactions_20260706 AS
SELECT t.* FROM public.transactions t
WHERE t.contact_id IN (
  SELECT id FROM public.contacts WHERE contact_type IN ('عميل ومورد','customer_supplier')
);

INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, reason, new_value)
VALUES (
  'hybrid_unification_20260706',
  'snapshot',
  'Pre-Layer1 safety snapshot for hybrid contacts',
  jsonb_build_object(
    'contacts_backed_up',      (SELECT COUNT(*) FROM public._backup_hybrid_contacts_20260706),
    'accounts_backed_up',      (SELECT COUNT(*) FROM public._backup_hybrid_accounts_20260706),
    'transactions_backed_up',  (SELECT COUNT(*) FROM public._backup_hybrid_transactions_20260706)
  )
);

CREATE OR REPLACE FUNCTION public.resolve_postable_account(
  p_user_id uuid,
  p_parent_code text,
  p_contact_id uuid DEFAULT NULL::uuid,
  p_contact_name text DEFAULT NULL::text,
  p_contact_type text DEFAULT NULL::text
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
  v_hybrid_code text;
BEGIN
  IF p_contact_type IS NULL AND p_contact_id IS NOT NULL THEN
    SELECT contact_type INTO v_ctype FROM public.contacts
    WHERE id = p_contact_id AND user_id = p_user_id;
  ELSE
    v_ctype := p_contact_type;
  END IF;

  -- HYBRID BRANCH (NEW) — keep one sub-account for عميل ومورد
  IF v_ctype IN ('عميل ومورد','customer_supplier') AND p_contact_id IS NOT NULL
     AND (v_target_parent LIKE '113%' OR v_target_parent LIKE '211%') THEN
    SELECT account_code INTO v_hybrid_code
    FROM public.accounts
    WHERE user_id = p_user_id
      AND contact_id = p_contact_id
      AND is_active
      AND (parent_code LIKE '113%' OR parent_code LIKE '211%')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_hybrid_code IS NOT NULL THEN
      UPDATE public.contacts
        SET linked_account_code = v_hybrid_code
        WHERE id = p_contact_id
          AND user_id = p_user_id
          AND (linked_account_code IS NULL OR linked_account_code <> v_hybrid_code);
      RETURN v_hybrid_code;
    END IF;
  END IF;

  IF v_ctype IS NOT NULL THEN
    IF v_ctype IN ('مورد','supplier','vendor') AND v_target_parent LIKE '113%' THEN
      v_target_parent := '2110';
    ELSIF v_ctype IN ('عميل','customer','client') AND v_target_parent LIKE '211%' THEN
      v_target_parent := '1130';
    ELSIF v_ctype IN ('موظف','employee') AND v_target_parent NOT LIKE '218%' THEN
      v_target_parent := '2180';
    END IF;
  END IF;

  SELECT * INTO v_parent FROM public.accounts
  WHERE user_id = p_user_id AND account_code = v_target_parent
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN p_parent_code;
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

  SELECT account_code INTO v_existing_code
  FROM public.accounts
  WHERE user_id = p_user_id
    AND parent_code = v_target_parent
    AND contact_id = p_contact_id
    AND is_active
  LIMIT 1;
  IF v_existing_code IS NOT NULL THEN
    UPDATE public.contacts
      SET linked_account_code = v_existing_code
      WHERE id = p_contact_id
        AND user_id = p_user_id
        AND (linked_account_code IS NULL OR linked_account_code <> v_existing_code)
        AND contact_type IN (COALESCE(v_ctype, contact_type));
    RETURN v_existing_code;
  END IF;

  SELECT linked_account_code INTO v_linked_code FROM public.contacts
  WHERE id = p_contact_id AND user_id = p_user_id;
  IF v_linked_code IS NOT NULL THEN
    SELECT account_code INTO v_existing_code FROM public.accounts
    WHERE user_id = p_user_id
      AND account_code = v_linked_code
      AND parent_code = v_target_parent
      AND is_active
    LIMIT 1;
    IF v_existing_code IS NOT NULL THEN
      UPDATE public.accounts
        SET contact_id = p_contact_id
        WHERE user_id = p_user_id AND account_code = v_existing_code AND contact_id IS NULL;
      RETURN v_existing_code;
    END IF;
  END IF;

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
