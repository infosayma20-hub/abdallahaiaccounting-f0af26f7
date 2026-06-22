-- Fix pos_category_print_rules RLS so team cashiers can read owner's mute rules
-- Without this, only the account owner sees the rules, and cashiers print everything everywhere.

DROP POLICY IF EXISTS "Users manage own print rules" ON public.pos_category_print_rules;

-- Team members (cashiers, etc.) can READ the owner's rules
CREATE POLICY "Team can view print rules"
ON public.pos_category_print_rules
FOR SELECT
TO authenticated
USING (user_id = public.get_team_owner_id(auth.uid()));

-- Owner + admins/super_admins from the same team can INSERT
CREATE POLICY "Owner and admins can insert print rules"
ON public.pos_category_print_rules
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = public.get_team_owner_id(auth.uid())
  AND (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Owner + admins/super_admins from the same team can UPDATE
CREATE POLICY "Owner and admins can update print rules"
ON public.pos_category_print_rules
FOR UPDATE
TO authenticated
USING (
  user_id = public.get_team_owner_id(auth.uid())
  AND (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  user_id = public.get_team_owner_id(auth.uid())
);

-- Owner + admins/super_admins from the same team can DELETE
CREATE POLICY "Owner and admins can delete print rules"
ON public.pos_category_print_rules
FOR DELETE
TO authenticated
USING (
  user_id = public.get_team_owner_id(auth.uid())
  AND (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);
