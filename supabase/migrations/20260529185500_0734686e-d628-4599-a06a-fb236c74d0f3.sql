-- Add 2-arg overload of create_reverse_entry that infers reversed_by from the original transaction's user_id.
-- This fixes the cascade_voucher_cancel_to_transactions trigger which calls the 2-arg form.
CREATE OR REPLACE FUNCTION public.create_reverse_entry(
  original_transaction_id uuid,
  reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.transactions
  WHERE id = original_transaction_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Original transaction % not found', original_transaction_id;
  END IF;

  SELECT public.create_reverse_entry(original_transaction_id, reason, v_user_id)::uuid INTO v_result;
  RETURN v_result;
END;
$$;