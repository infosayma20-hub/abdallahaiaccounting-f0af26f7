-- Allow unauthenticated (anon) users to read pos_orders for digital receipt
CREATE POLICY "Public can view order for receipt"
ON public.pos_orders
FOR SELECT
TO anon
USING (true);

-- Allow unauthenticated (anon) users to read pos_order_lines for digital receipt
CREATE POLICY "Public can view order lines for receipt"
ON public.pos_order_lines
FOR SELECT
TO anon
USING (true);

-- Allow anon to read company info for receipt display
CREATE POLICY "Public can view companies for receipt"
ON public.companies
FOR SELECT
TO anon
USING (true);

-- Allow anon to read pos_sessions for cashier name on receipt
CREATE POLICY "Public can view pos sessions for receipt"
ON public.pos_sessions
FOR SELECT
TO anon
USING (true);