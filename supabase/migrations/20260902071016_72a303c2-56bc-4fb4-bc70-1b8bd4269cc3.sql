REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) TO service_role;