GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_printers TO authenticated;
GRANT ALL ON public.pos_printers TO service_role;

DROP POLICY IF EXISTS "Users manage own printers" ON public.pos_printers;

CREATE POLICY "Team can view POS printers"
ON public.pos_printers
FOR SELECT
TO authenticated
USING (user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Owner can create POS printers"
ON public.pos_printers
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR (user_id = public.get_team_owner_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))));

CREATE POLICY "Owner and admins can update POS printers"
ON public.pos_printers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR (user_id = public.get_team_owner_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))))
WITH CHECK (user_id = auth.uid() OR (user_id = public.get_team_owner_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))));

CREATE POLICY "Owner and admins can delete POS printers"
ON public.pos_printers
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR (user_id = public.get_team_owner_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))));