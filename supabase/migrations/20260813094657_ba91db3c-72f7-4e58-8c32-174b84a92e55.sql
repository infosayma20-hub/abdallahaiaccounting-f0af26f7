DROP POLICY IF EXISTS "Owners manage their loyalty programs" ON public.loyalty_programs;
CREATE POLICY "Team manages loyalty programs" ON public.loyalty_programs
  FOR ALL TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Owners manage their loyalty members" ON public.loyalty_members;
CREATE POLICY "Team manages loyalty members" ON public.loyalty_members
  FOR ALL TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_programs_slug_key ON public.loyalty_programs (lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_programs_one_per_owner ON public.loyalty_programs (user_id);