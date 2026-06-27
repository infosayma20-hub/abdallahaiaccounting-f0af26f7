
CREATE OR REPLACE FUNCTION public.resolve_postable_account(
  p_user_id uuid,
  p_parent_code text,
  p_contact_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_children boolean;
  v_parent record;
  v_existing_code text;
  v_linked_code text;
  v_new_code text;
  v_max_code text;
  v_next_num bigint;
  v_name text;
BEGIN
  -- Locate the parent account
  SELECT * INTO v_parent FROM public.accounts
  WHERE user_id = p_user_id AND account_code = p_parent_code
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN p_parent_code; -- caller will fail validator with a clearer error
  END IF;

  -- If parent has no children, it's directly postable
  SELECT EXISTS(
    SELECT 1 FROM public.accounts
    WHERE user_id = p_user_id AND parent_code = p_parent_code
  ) INTO v_has_children;

  IF NOT v_has_children THEN
    RETURN p_parent_code;
  END IF;

  -- Parent has children → must route to a sub-account
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'الحساب % حساب أب — يجب تحديد جهة اتصال لربطها بحساب فرعي', p_parent_code
      USING ERRCODE = 'P0001';
  END IF;

  -- 1) Contact already has a linked sub-account under this parent
  SELECT linked_account_code INTO v_linked_code FROM public.contacts
  WHERE id = p_contact_id AND user_id = p_user_id;

  IF v_linked_code IS NOT NULL THEN
    SELECT account_code INTO v_existing_code FROM public.accounts
    WHERE user_id = p_user_id
      AND account_code = v_linked_code
      AND parent_code = p_parent_code
    LIMIT 1;
    IF v_existing_code IS NOT NULL THEN
      RETURN v_existing_code;
    END IF;
  END IF;

  -- 2) Try to find an existing sub-account whose name matches the contact
  v_name := COALESCE(p_contact_name, (SELECT contact_name FROM public.contacts WHERE id = p_contact_id));

  IF v_name IS NOT NULL THEN
    SELECT account_code INTO v_existing_code FROM public.accounts
    WHERE user_id = p_user_id
      AND parent_code = p_parent_code
      AND account_name = v_name
    LIMIT 1;
    IF v_existing_code IS NOT NULL THEN
      UPDATE public.contacts SET linked_account_code = v_existing_code
      WHERE id = p_contact_id AND user_id = p_user_id;
      RETURN v_existing_code;
    END IF;
  END IF;

  -- 3) Create a new sub-account: <parent>NN (e.g. 113001, 113002, ...)
  SELECT account_code INTO v_max_code FROM public.accounts
  WHERE user_id = p_user_id
    AND parent_code = p_parent_code
    AND account_code ~ ('^' || p_parent_code || '[0-9]+$')
  ORDER BY length(account_code) DESC, account_code DESC
  LIMIT 1;

  IF v_max_code IS NULL THEN
    v_new_code := p_parent_code || '01';
  ELSE
    v_next_num := COALESCE(
      NULLIF(regexp_replace(v_max_code, '^' || p_parent_code, ''), '')::bigint,
      0
    ) + 1;
    v_new_code := p_parent_code || lpad(v_next_num::text, 2, '0');
  END IF;

  INSERT INTO public.accounts(
    user_id, account_code, account_name, account_type,
    parent_code, is_system, is_active, nature, currency
  ) VALUES (
    p_user_id, v_new_code,
    COALESCE(v_name, 'حساب فرعي ' || v_new_code),
    v_parent.account_type,
    p_parent_code, false, true,
    COALESCE(v_parent.nature, 'debit'),
    COALESCE(v_parent.currency, 'شيكل')
  );

  UPDATE public.contacts SET linked_account_code = v_new_code
  WHERE id = p_contact_id AND user_id = p_user_id;

  RETURN v_new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_postable_account(uuid, text, uuid, text) TO authenticated, service_role;
