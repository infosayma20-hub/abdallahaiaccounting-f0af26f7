
-- Drop old strict policies
DROP POLICY IF EXISTS "Users can insert employee movements" ON public.employee_financial_movements;
DROP POLICY IF EXISTS "Users can view their employee movements" ON public.employee_financial_movements;
DROP POLICY IF EXISTS "Users can update their employee movements" ON public.employee_financial_movements;
DROP POLICY IF EXISTS "Users can delete their employee movements" ON public.employee_financial_movements;

-- Unified team-aware policy (matches pos_orders pattern)
CREATE POLICY "Team can manage employee movements"
ON public.employee_financial_movements
FOR ALL
TO authenticated
USING (public.is_team_member(auth.uid(), user_id))
WITH CHECK (public.is_team_member(auth.uid(), user_id));
