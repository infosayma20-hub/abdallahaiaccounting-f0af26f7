
-- Drop old restrictive policy
DROP POLICY IF EXISTS "Owner manages pos devices" ON public.pos_devices;

-- Create team-aware policies
CREATE POLICY "Team can view pos devices"
  ON public.pos_devices FOR SELECT TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Team can insert pos devices"
  ON public.pos_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Team can update pos devices"
  ON public.pos_devices FOR UPDATE TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Team can delete pos devices"
  ON public.pos_devices FOR DELETE TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()));
