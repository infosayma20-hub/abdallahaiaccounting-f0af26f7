DROP FUNCTION IF EXISTS public.adjust_product_stock(uuid, numeric, uuid, text);

REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) TO service_role;

NOTIFY pgrst, 'reload schema';