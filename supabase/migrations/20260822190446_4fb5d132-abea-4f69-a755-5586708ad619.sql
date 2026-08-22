DROP POLICY IF EXISTS "HR can view branches" ON public.branches;
CREATE POLICY "HR can view branches"
ON public.branches
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hr_manager'::app_role)
  AND user_id = get_team_owner_id(auth.uid())
);