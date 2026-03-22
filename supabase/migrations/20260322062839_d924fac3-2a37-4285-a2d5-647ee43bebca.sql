
-- Allow portal users to read their own entry from malaki_portal_users via auth_user_id
CREATE POLICY "Portal users can read own entry"
ON public.malaki_portal_users
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());
