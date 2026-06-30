
-- Performance: rewrite RLS on product_modifier_groups & modifier_options
-- from IN (subquery) to EXISTS to avoid full-table rewrap during INSERT/SELECT.
-- Behavior identical; only execution plan changes.

DROP POLICY IF EXISTS "Users manage own product_modifier_groups" ON public.product_modifier_groups;
CREATE POLICY "Users manage own product_modifier_groups"
ON public.product_modifier_groups
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_modifier_groups.product_id
      AND (p.user_id = auth.uid() OR public.is_team_member(auth.uid(), p.user_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_modifier_groups.product_id
      AND (p.user_id = auth.uid() OR public.is_team_member(auth.uid(), p.user_id))
  )
);

DROP POLICY IF EXISTS "Users manage own modifier_options" ON public.modifier_options;
CREATE POLICY "Users manage own modifier_options"
ON public.modifier_options
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.modifier_groups g
    WHERE g.id = modifier_options.group_id
      AND (g.user_id = auth.uid() OR public.is_team_member(auth.uid(), g.user_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.modifier_groups g
    WHERE g.id = modifier_options.group_id
      AND (g.user_id = auth.uid() OR public.is_team_member(auth.uid(), g.user_id))
  )
);
