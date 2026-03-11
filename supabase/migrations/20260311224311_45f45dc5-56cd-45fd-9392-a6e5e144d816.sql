-- Allow cashiers to read their own pos_user record
DROP POLICY IF EXISTS "Owner manages pos users" ON public.pos_users;

CREATE POLICY "Owner and team read pos users"
ON public.pos_users FOR SELECT TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
);

CREATE POLICY "Owner manages pos users"
ON public.pos_users FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow cashiers to read their own permissions
DROP POLICY IF EXISTS "Owner manages pos permissions" ON public.pos_user_permissions;

CREATE POLICY "Owner and team read pos permissions"
ON public.pos_user_permissions FOR SELECT TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
);

CREATE POLICY "Owner manages pos permissions"
ON public.pos_user_permissions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);