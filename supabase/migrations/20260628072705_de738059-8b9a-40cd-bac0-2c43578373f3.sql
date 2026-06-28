
CREATE OR REPLACE FUNCTION public.archive_contact_with_reversals(
  p_contact_id uuid,
  p_reason text DEFAULT 'أرشفة وعكس حركات بناءً على طلب الإدارة'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_contact_company uuid;
  v_tx record;
  v_reversed_count int := 0;
  v_skipped_count int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;

  -- جلب الشركة الحالية للمستخدم (من user_roles أو profiles)
  SELECT company_id INTO v_contact_company FROM public.contacts WHERE id = p_contact_id;
  IF v_contact_company IS NULL THEN
    RAISE EXCEPTION 'جهة الاتصال غير موجودة';
  END IF;

  -- صلاحية: admin أو accountant_senior فقط
  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'accountant_senior'::app_role)
  ) THEN
    RAISE EXCEPTION 'صلاحية غير كافية. هذه العملية محصورة للمدير أو المحاسب الأول.';
  END IF;

  -- عكس كل الحركات غير المحذوفة المرتبطة بالجهة
  FOR v_tx IN
    SELECT id FROM public.transactions
    WHERE contact_id = p_contact_id
      AND (is_deleted IS NULL OR is_deleted = false)
    ORDER BY transaction_date ASC, created_at ASC
  LOOP
    BEGIN
      PERFORM public.create_reverse_entry(v_tx.id, p_reason, v_user_id);
      v_reversed_count := v_reversed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped_count := v_skipped_count + 1;
    END;
  END LOOP;

  -- أرشفة الجهة
  UPDATE public.contacts
  SET is_archived = true,
      archived_at = now(),
      archived_by = v_user_id,
      current_balance = 0
  WHERE id = p_contact_id;

  RETURN jsonb_build_object(
    'success', true,
    'reversed', v_reversed_count,
    'skipped', v_skipped_count,
    'contact_id', p_contact_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_contact_with_reversals(uuid, text) TO authenticated;
