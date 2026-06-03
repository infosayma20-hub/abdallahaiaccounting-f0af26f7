CREATE OR REPLACE FUNCTION public.reorder_pos_products(p_product_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_idx int;
BEGIN
  v_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR v_idx IN 1 .. array_length(p_product_ids, 1) LOOP
    UPDATE public.products
       SET pos_sort_order = v_idx - 1,
           updated_at = now()
     WHERE id = p_product_ids[v_idx]
       AND user_id = v_owner;
  END LOOP;
END;
$$;