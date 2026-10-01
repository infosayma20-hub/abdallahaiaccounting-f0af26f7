DROP POLICY IF EXISTS "owner or super admin reads backup runs" ON public.cloud_backup_runs;
CREATE POLICY "super admin reads backup runs" ON public.cloud_backup_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));