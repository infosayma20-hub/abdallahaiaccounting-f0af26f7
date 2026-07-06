DROP POLICY IF EXISTS "Team can manage kiosk settings" ON public.kiosk_settings;
DROP POLICY IF EXISTS "Users manage own kiosk settings" ON public.kiosk_settings;

CREATE POLICY "Owner or POS team can manage kiosk settings"
  ON public.kiosk_settings
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      public.is_team_member(auth.uid(), user_id)
      AND public.user_can_access(auth.uid(), 'pos')
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      public.is_team_member(auth.uid(), user_id)
      AND public.user_can_access(auth.uid(), 'pos')
    )
  );