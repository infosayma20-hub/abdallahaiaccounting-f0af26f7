
CREATE OR REPLACE FUNCTION public.delete_voucher_transactions(
  p_voucher_id uuid,
  p_owner_id   uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_owner uuid;
  v_voucher_owner uuid;
  v_deleted integer := 0;
BEGIN
  -- 1) لا بد من مستخدم مصادق عليه
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_voucher_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  -- 2) تحقق أن المتصل يعمل ضمن نفس المستأجر (dataOwnerId)
  v_caller_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_caller_owner <> p_owner_id THEN
    RAISE EXCEPTION 'forbidden_owner_mismatch';
  END IF;

  -- 3) تحقق أن السند فعلاً موجود ويعود لنفس المستأجر
  SELECT user_id INTO v_voucher_owner
  FROM public.vouchers
  WHERE id = p_voucher_id;

  IF v_voucher_owner IS NULL THEN
    RAISE EXCEPTION 'voucher_not_found';
  END IF;

  IF v_voucher_owner <> p_owner_id THEN
    RAISE EXCEPTION 'voucher_owner_mismatch';
  END IF;

  -- 4) الحذف الآمن المحصور بالسند والمالك (نمط idempotency_key المعتمد)
  WITH deleted AS (
    DELETE FROM public.transactions
     WHERE user_id = p_owner_id
       AND idempotency_key ILIKE 'VOUCHER-' || p_voucher_id::text || '%'
    RETURNING id
  )
  SELECT count(*)::int INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_voucher_transactions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_voucher_transactions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_voucher_transactions(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.delete_voucher_transactions(uuid, uuid) IS
'حذف آمن لحركات سند قيد معيّن. يتحقق من أن المتصل يعود لنفس المستأجر ومن ملكية السند قبل الحذف. يُستخدم من مسار تعديل السند لضمان عدم بقاء حركات يتيمة عند تعديل المستخدمين ذوي الصلاحيات المحدودة.';
