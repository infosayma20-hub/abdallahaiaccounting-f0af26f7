-- Same access rule, evaluated once per query instead of once per row.
-- is_team_member(uid, owner) == (owner = uid OR owner = get_team_owner_id(uid)),
-- and get_team_owner_id() == get_team_owner_id(auth.uid()); wrapping in SELECT
-- lets Postgres compute the team owner a single time (initplan).
ALTER POLICY "Users manage own product_modifier_groups" ON public.product_modifier_groups
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_modifier_groups.product_id
      AND (p.user_id = (SELECT auth.uid()) OR p.user_id = (SELECT public.get_team_owner_id()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_modifier_groups.product_id
      AND (p.user_id = (SELECT auth.uid()) OR p.user_id = (SELECT public.get_team_owner_id()))
  )
);