REVOKE ALL ON public.product_warehouse_balances FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.product_warehouse_balances FROM authenticated;
GRANT SELECT ON public.product_warehouse_balances TO authenticated;
GRANT ALL ON public.product_warehouse_balances TO service_role;