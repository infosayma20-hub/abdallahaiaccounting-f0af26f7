CREATE POLICY "Team members can view branches" ON public.branches FOR SELECT TO authenticated USING (
  user_id = (SELECT public.get_team_owner_id(auth.uid()))
);