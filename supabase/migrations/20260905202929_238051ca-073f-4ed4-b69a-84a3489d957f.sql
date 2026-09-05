CREATE OR REPLACE FUNCTION public.delete_voucher_transactions(p_voucher_id uuid, p_owner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_owner uuid;
  v_voucher_owner uuid;
  v_deleted integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_voucher_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  v_caller_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_caller_owner <> p_owner_id THEN
    RAISE EXCEPTION 'forbidden_owner_mismatch';
  END IF;

  SELECT user_id INTO v_voucher_owner
  FROM public.vouchers
  WHERE id = p_voucher_id;

  IF v_voucher_owner IS NULL THEN
    RAISE EXCEPTION 'voucher_not_found';
  END IF;

  IF v_voucher_owner <> p_owner_id THEN
    RAISE EXCEPTION 'voucher_owner_mismatch';
  END IF;

  -- Soft-delete instead of physical delete: preserve the audit trail.
  -- idempotency_key is released (set to NULL) so the rebuilt lines can reuse keys.
  WITH updated AS (
    UPDATE public.transactions
       SET is_deleted = true,
           idempotency_key = NULL
     WHERE user_id = p_owner_id
       AND idempotency_key ILIKE 'VOUCHER-' || p_voucher_id::text || '%'
       AND COALESCE(is_deleted, false) = false
    RETURNING id
  )
  SELECT count(*)::int INTO v_deleted FROM updated;

  RETURN v_deleted;
END;
$function$;