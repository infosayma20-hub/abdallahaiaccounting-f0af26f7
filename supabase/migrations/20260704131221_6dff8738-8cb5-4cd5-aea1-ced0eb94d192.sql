DROP POLICY IF EXISTS "Users view own cost centers" ON public.cost_centers;
DROP POLICY IF EXISTS "Users update own cost centers" ON public.cost_centers;
DROP POLICY IF EXISTS "Users delete own cost centers" ON public.cost_centers;
DROP POLICY IF EXISTS "Users insert own cost centers" ON public.cost_centers;

CREATE POLICY "Team can view cost centers"
  ON public.cost_centers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can insert cost centers"
  ON public.cost_centers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can update cost centers"
  ON public.cost_centers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can delete cost centers"
  ON public.cost_centers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));