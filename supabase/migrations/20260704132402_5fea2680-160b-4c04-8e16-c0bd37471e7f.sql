DROP POLICY IF EXISTS "Users can view own transfers" ON public.cash_transfers;
DROP POLICY IF EXISTS "Users can insert own transfers" ON public.cash_transfers;
DROP POLICY IF EXISTS "Team can view transfers" ON public.cash_transfers;
DROP POLICY IF EXISTS "Team can insert transfers" ON public.cash_transfers;
DROP POLICY IF EXISTS "Team can update transfers" ON public.cash_transfers;
DROP POLICY IF EXISTS "Team can delete transfers" ON public.cash_transfers;

CREATE POLICY "Team can view transfers" ON public.cash_transfers FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team can insert transfers" ON public.cash_transfers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team can update transfers" ON public.cash_transfers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team can delete transfers" ON public.cash_transfers FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));