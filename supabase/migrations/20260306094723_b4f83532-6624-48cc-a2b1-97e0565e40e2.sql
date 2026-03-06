
-- Drop old permissive policies
DROP POLICY IF EXISTS "Users manage own contractor projects" ON public.contractor_projects;
DROP POLICY IF EXISTS "Users manage own contractor transactions" ON public.contractor_transactions;

-- Contractor projects: only owner
CREATE POLICY "Users manage own contractor projects"
  ON public.contractor_projects FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Contractor transactions: only owner
CREATE POLICY "Users manage own contractor transactions"
  ON public.contractor_transactions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
