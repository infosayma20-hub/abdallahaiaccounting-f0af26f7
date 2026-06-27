
-- 1) user_roles: replace blanket admin ALL policy with granular policies that block super_admin escalation
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert non-super roles"
ON public.user_roles FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

CREATE POLICY "Admins can update non-super roles"
ON public.user_roles FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

CREATE POLICY "Admins can delete non-super roles"
ON public.user_roles FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

CREATE POLICY "Super admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2) referral_codes: remove public lookup; only owner can read
DROP POLICY IF EXISTS "Anyone can lookup code" ON public.referral_codes;

CREATE POLICY "Users can view their own referral code"
ON public.referral_codes FOR SELECT
TO authenticated
USING (user_id = auth.uid());
