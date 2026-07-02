
CREATE POLICY "uaao_super_admin_all" ON public.user_app_access_overrides
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
