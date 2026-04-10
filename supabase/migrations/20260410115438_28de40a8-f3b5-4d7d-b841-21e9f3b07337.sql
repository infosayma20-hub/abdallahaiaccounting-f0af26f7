-- =============================================
-- FIX 1: Remove anon SELECT on company_settings
-- =============================================
DROP POLICY IF EXISTS "Public can view company settings for receipt" ON public.company_settings;

-- =============================================
-- FIX 2: Remove anon SELECT on POS tables
-- =============================================
DROP POLICY IF EXISTS "Public can view order for receipt" ON public.pos_orders;
DROP POLICY IF EXISTS "Public can view order lines for receipt" ON public.pos_order_lines;
DROP POLICY IF EXISTS "Public can view pos sessions for receipt" ON public.pos_sessions;
DROP POLICY IF EXISTS "Public can view payments for receipt" ON public.pos_payments;
DROP POLICY IF EXISTS "Public can view companies for receipt" ON public.companies;

-- =============================================
-- FIX 3: Remove unconditional authenticated policies on procurement_request_items
-- The team-scoped policies already handle access correctly.
-- =============================================
DROP POLICY IF EXISTS "select_procurement_request_items" ON public.procurement_request_items;
DROP POLICY IF EXISTS "insert_procurement_request_items" ON public.procurement_request_items;
DROP POLICY IF EXISTS "update_procurement_request_items" ON public.procurement_request_items;
DROP POLICY IF EXISTS "delete_procurement_request_items" ON public.procurement_request_items;