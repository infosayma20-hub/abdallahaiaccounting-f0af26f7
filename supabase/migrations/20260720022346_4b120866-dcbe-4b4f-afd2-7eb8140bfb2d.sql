DROP POLICY IF EXISTS "HR manager can update team settings" ON public.company_settings;
CREATE POLICY "HR manager can update team settings"
ON public.company_settings FOR UPDATE
USING (public.is_team_member(auth.uid(), user_id) AND public.has_role(auth.uid(),'hr_manager'::app_role))
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.has_role(auth.uid(),'hr_manager'::app_role));

DROP POLICY IF EXISTS "HR manager can insert team settings" ON public.company_settings;
CREATE POLICY "HR manager can insert team settings"
ON public.company_settings FOR INSERT
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.has_role(auth.uid(),'hr_manager'::app_role));