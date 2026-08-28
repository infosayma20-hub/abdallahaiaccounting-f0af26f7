-- Replace the hardcoded-UUID trial signup viewer policy with a role-based one
INSERT INTO public.user_roles (user_id, role)
VALUES ('a26051b0-2904-4dbc-ab41-d171ae2d69be'::uuid, 'marketing'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

DROP POLICY IF EXISTS "Marketing viewer sees trial signups" ON public.trial_signups;

CREATE POLICY "Marketing role views trial signups"
ON public.trial_signups
FOR SELECT
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'marketing'::public.app_role));