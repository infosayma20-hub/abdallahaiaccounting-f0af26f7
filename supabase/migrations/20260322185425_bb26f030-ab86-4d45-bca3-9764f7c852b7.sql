-- Fix: The existing policy targets 'public' role instead of 'anon'
-- Drop and recreate with correct role
DROP POLICY IF EXISTS "Public can view payments for receipt" ON public.pos_payments;
CREATE POLICY "Public can view payments for receipt"
ON public.pos_payments
FOR SELECT
TO anon
USING (true);