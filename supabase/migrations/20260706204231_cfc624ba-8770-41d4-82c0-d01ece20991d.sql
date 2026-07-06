DROP POLICY IF EXISTS "Users manage own kiosk settings" ON public.kiosk_settings;

CREATE POLICY "Team can manage kiosk settings"
  ON public.kiosk_settings
  FOR ALL
  TO authenticated
  USING (
    public.is_team_member(auth.uid(), user_id)
    AND public.user_can_access(auth.uid(), 'pos')
  )
  WITH CHECK (
    public.is_team_member(auth.uid(), user_id)
    AND public.user_can_access(auth.uid(), 'pos')
  );