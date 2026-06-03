-- RPC to let any team member (cashier, call-center, manager) reorder POS products
-- within their company's catalog. Bypasses the "managers only" update RLS on products
-- but still strictly scopes to the same data owner / company as the caller.

CREATE OR REPLACE FUNCTION public.reorder_pos_products(p_product_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_owner uuid;
  v_idx int;
BEGIN
  -- Resolve the caller's data owner (team owner). Falls back to auth.uid().
  BEGIN
    v_caller_owner := public.get_data_owner_id();
  EXCEPTION WHEN undefined_function THEN
    v_caller_owner := auth.uid();
  END;

  IF v_caller_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Update only products that belong to the caller's owner — prevents cross-tenant writes
  FOR v_idx IN 1 .. array_length(p_product_ids, 1) LOOP
    UPDATE public.products
    SET pos_sort_order = v_idx - 1,
        updated_at = now()
    WHERE id = p_product_ids[v_idx]
      AND user_id = v_caller_owner;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_pos_products(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_pos_products(uuid[]) TO authenticated;