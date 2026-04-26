-- Allow trusted super admins to view branches for support/device setup.
DROP POLICY IF EXISTS "Super admins can view branches" ON public.branches;
CREATE POLICY "Super admins can view branches"
ON public.branches
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Allow trusted super admins to view POS terminals for support/device setup.
DROP POLICY IF EXISTS "Super admins can view POS terminals" ON public.pos_terminals;
CREATE POLICY "Super admins can view POS terminals"
ON public.pos_terminals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));