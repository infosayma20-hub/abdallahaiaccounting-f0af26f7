-- 1) Enforce caller RLS on previously definer-semantics views
ALTER VIEW public.branches_safe               SET (security_invoker = true);
ALTER VIEW public.product_warehouse_stock     SET (security_invoker = true);
ALTER VIEW public.pos_orders_effective        SET (security_invoker = true);
ALTER VIEW public.cs_customer_timeline_view   SET (security_invoker = true);
ALTER VIEW public.v_sales_by_supplier         SET (security_invoker = true);
ALTER VIEW public.v_invoices_payment_mismatch SET (security_invoker = true);
ALTER VIEW public.v_cash_transfers_missing_gl SET (security_invoker = true);
ALTER VIEW public.v_identity_column_dictionary SET (security_invoker = true);
ALTER VIEW public.v_tenant_scope_map          SET (security_invoker = true);

-- 2) Remove anon access + write privileges; keep read-only for authenticated
REVOKE ALL ON public.branches_safe               FROM anon, authenticated;
REVOKE ALL ON public.product_warehouse_stock     FROM anon, authenticated;
REVOKE ALL ON public.pos_orders_effective        FROM anon, authenticated;
REVOKE ALL ON public.cs_customer_timeline_view   FROM anon, authenticated;
REVOKE ALL ON public.v_sales_by_supplier         FROM anon, authenticated;
REVOKE ALL ON public.v_invoices_payment_mismatch FROM anon, authenticated;
REVOKE ALL ON public.v_cash_transfers_missing_gl FROM anon, authenticated;
REVOKE ALL ON public.v_identity_column_dictionary FROM anon, authenticated;
REVOKE ALL ON public.v_tenant_scope_map          FROM anon, authenticated;

GRANT SELECT ON public.branches_safe               TO authenticated;
GRANT SELECT ON public.product_warehouse_stock     TO authenticated;
GRANT SELECT ON public.pos_orders_effective        TO authenticated;
GRANT SELECT ON public.cs_customer_timeline_view   TO authenticated;
GRANT SELECT ON public.v_sales_by_supplier         TO authenticated;
GRANT SELECT ON public.v_invoices_payment_mismatch TO authenticated;
GRANT SELECT ON public.v_cash_transfers_missing_gl TO authenticated;

-- internal diagnostics: service role only
GRANT ALL ON public.v_identity_column_dictionary TO service_role;
GRANT ALL ON public.v_tenant_scope_map           TO service_role;