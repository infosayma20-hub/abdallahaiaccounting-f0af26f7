
-- Allow hr_manager to send broadcasts and manage company templates
DROP POLICY IF EXISTS "admins_insert_broadcasts" ON public.notification_broadcasts;
CREATE POLICY "admins_insert_broadcasts" ON public.notification_broadcasts
  FOR INSERT TO authenticated
  WITH CHECK (
    sent_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );

DROP POLICY IF EXISTS "admins_view_company_broadcasts" ON public.notification_broadcasts;
CREATE POLICY "admins_view_company_broadcasts" ON public.notification_broadcasts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR sent_by = auth.uid()
  );

DROP POLICY IF EXISTS "view_system_or_company_templates" ON public.notification_templates;
CREATE POLICY "view_system_or_company_templates" ON public.notification_templates
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR (
      company_id IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'hr_manager')
        OR public.has_role(auth.uid(), 'accountant_senior')
      )
    )
  );

DROP POLICY IF EXISTS "admins_insert_templates" ON public.notification_templates;
CREATE POLICY "admins_insert_templates" ON public.notification_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );

DROP POLICY IF EXISTS "admins_update_templates" ON public.notification_templates;
CREATE POLICY "admins_update_templates" ON public.notification_templates
  FOR UPDATE TO authenticated
  USING (
    is_system = false
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );

DROP POLICY IF EXISTS "admins_delete_templates" ON public.notification_templates;
CREATE POLICY "admins_delete_templates" ON public.notification_templates
  FOR DELETE TO authenticated
  USING (
    is_system = false
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );
