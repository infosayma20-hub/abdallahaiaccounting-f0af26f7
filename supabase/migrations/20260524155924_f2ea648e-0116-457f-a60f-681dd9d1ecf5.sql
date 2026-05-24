
-- malaki_portal_settings: previously had RLS enabled with no policies (effectively locked).
-- Add explicit policies so the linter is satisfied and the access intent is documented.
DROP POLICY IF EXISTS "Super admins manage portal settings" ON public.malaki_portal_settings;
CREATE POLICY "Super admins manage portal settings"
  ON public.malaki_portal_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
