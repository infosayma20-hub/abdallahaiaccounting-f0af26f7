
CREATE OR REPLACE FUNCTION public.move_account(
  p_account_id uuid,
  p_new_parent_code text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_account RECORD;
  v_new_parent RECORD;
  v_is_descendant boolean;
BEGIN
  SELECT * INTO v_account
  FROM public.accounts
  WHERE id = p_account_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحساب غير موجود');
  END IF;

  IF v_account.is_system_protected THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن نقل حساب محمي مرتبط بقيود تلقائية');
  END IF;

  IF p_new_parent_code IS NOT NULL AND p_new_parent_code = v_account.account_code THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن نقل الحساب تحت نفسه');
  END IF;

  IF p_new_parent_code IS NOT NULL THEN
    SELECT * INTO v_new_parent
    FROM public.accounts
    WHERE account_code = p_new_parent_code AND user_id = p_user_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'حساب الأب الجديد غير موجود');
    END IF;

    -- Check circular: new parent must not be a descendant of this account
    WITH RECURSIVE descendants AS (
      SELECT account_code FROM public.accounts
      WHERE parent_code = v_account.account_code AND user_id = p_user_id
        AND account_code != v_account.account_code
      UNION ALL
      SELECT c.account_code FROM public.accounts c
      JOIN descendants d ON c.parent_code = d.account_code
      WHERE c.user_id = p_user_id AND c.account_code != c.parent_code
    )
    SELECT EXISTS(SELECT 1 FROM descendants WHERE account_code = p_new_parent_code)
    INTO v_is_descendant;

    IF v_is_descendant THEN
      RETURN jsonb_build_object('success', false, 'error', 'لا يمكن نقل الحساب تحت أحد حساباته الفرعية');
    END IF;
  END IF;

  UPDATE public.accounts
  SET parent_code = p_new_parent_code, updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'تم نقل الحساب بنجاح');
END;
$$;
