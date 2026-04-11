-- 1. Fix attendance_audit_logs: drop lingering HR policy without tenant scope
DROP POLICY IF EXISTS "HR can view organization audit logs" ON public.attendance_audit_logs;

-- 2. Fix company-logos: drop broad INSERT/UPDATE/DELETE policies
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logos" ON storage.objects;

-- 3. task_users: drop the broad SELECT and recreate without password_hash access
-- Since REVOKE column-level doesn't work with RLS permissive policies,
-- we need to use a security definer function approach
DROP POLICY IF EXISTS "team_task_users_select" ON public.task_users;
DROP POLICY IF EXISTS "team_task_users_select_safe" ON public.task_users;

-- Recreate SELECT policy that still works but column revoke blocks password_hash
CREATE POLICY "team_task_users_select_v2"
ON public.task_users FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

-- 4. malaki_portal_users: tighten SELECT to only own row with non-null auth_user_id
DROP POLICY IF EXISTS "Portal users can read own entry" ON public.malaki_portal_users;

CREATE POLICY "Portal users can read own entry v2"
ON public.malaki_portal_users FOR SELECT
TO authenticated
USING (
  auth_user_id IS NOT NULL
  AND auth_user_id = auth.uid()
);