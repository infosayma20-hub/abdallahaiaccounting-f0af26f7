
-- Fix the permissive policy: restrict updates to only survey completion fields
DROP POLICY IF EXISTS "Anyone can complete survey by token" ON public.customer_surveys;

CREATE POLICY "Anyone can complete survey by token" ON public.customer_surveys
  FOR UPDATE TO anon, authenticated
  USING (status IN ('sent', 'opened') AND expires_at > NOW())
  WITH CHECK (status IN ('opened', 'completed'));
