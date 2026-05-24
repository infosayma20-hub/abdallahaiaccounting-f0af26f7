
-- 1) Restrict reading of sensitive hash columns to service_role only
REVOKE SELECT (pin_hash) ON public.pos_users FROM anon, authenticated;
REVOKE SELECT (password_hash) ON public.task_users FROM anon, authenticated;
REVOKE SELECT (password_hash) ON public.malaki_portal_users FROM anon, authenticated;
REVOKE SELECT (secret_key) ON public.branches FROM anon, authenticated;

-- 2) qr_tokens: scope SELECT to the tenant that owns the branch
DROP POLICY IF EXISTS "Authenticated users can read active tokens" ON public.qr_tokens;
CREATE POLICY "Team members can read active tokens for own branches"
  ON public.qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = qr_tokens.branch_id
        AND b.user_id = (SELECT public.get_team_owner_id(auth.uid()))
    )
  );

-- 3) admin_notifications: remove anonymous insert policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.admin_notifications;
CREATE POLICY "Service role inserts notifications"
  ON public.admin_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4) storage company-assets bucket: constrain uploads to user's own folder
DROP POLICY IF EXISTS auth_upload_company_assets ON storage.objects;
CREATE POLICY auth_upload_company_assets
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Also restrict update/delete to own folder
DROP POLICY IF EXISTS auth_update_company_assets ON storage.objects;
CREATE POLICY auth_update_company_assets
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS auth_delete_company_assets ON storage.objects;
CREATE POLICY auth_delete_company_assets
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) Helper to verify task_user ownership (used by edge function)
CREATE OR REPLACE FUNCTION public.is_task_user_owned_by(_task_user_id uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_users
    WHERE id = _task_user_id AND user_id = _owner
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_task_user_owned_by(uuid, uuid) FROM anon;
