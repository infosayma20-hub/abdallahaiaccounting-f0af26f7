
-- Drop old policies
DROP POLICY IF EXISTS "Users can view own cash boxes" ON public.cash_boxes;
DROP POLICY IF EXISTS "Users can insert own cash boxes" ON public.cash_boxes;
DROP POLICY IF EXISTS "Users can update own cash boxes" ON public.cash_boxes;
DROP POLICY IF EXISTS "Users can delete own cash boxes" ON public.cash_boxes;

-- Create team-aware policies
CREATE POLICY "Team can view cash boxes"
  ON public.cash_boxes FOR SELECT TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Team can insert cash boxes"
  ON public.cash_boxes FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Team can update cash boxes"
  ON public.cash_boxes FOR UPDATE TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Team can delete cash boxes"
  ON public.cash_boxes FOR DELETE TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()));
