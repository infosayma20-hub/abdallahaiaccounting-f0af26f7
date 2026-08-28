DROP POLICY IF EXISTS "Admin can manage team roles" ON public.user_roles;
CREATE POLICY "Admin can manage team roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id AND p.invited_by = auth.uid()
  )
);