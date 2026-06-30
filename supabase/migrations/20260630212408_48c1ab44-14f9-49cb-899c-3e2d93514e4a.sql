-- Optimize RLS policy on order_item_modifiers
-- BEFORE: subquery IN (SELECT ol.id FROM pos_order_lines JOIN pos_orders ...)
--   → planner materializes a large set on every INSERT/SELECT, ~4.5s/call.
-- AFTER:  EXISTS with single PK lookup against pos_order_lines.user_id
--   (already denormalized + indexed). Semantically identical: is_team_member
--   returns true when ol.user_id = auth.uid() as well, matching original.
-- No application code changes required.

DROP POLICY IF EXISTS "Users manage own order_item_modifiers" ON public.order_item_modifiers;

CREATE POLICY "Users manage own order_item_modifiers"
ON public.order_item_modifiers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pos_order_lines ol
    WHERE ol.id = order_item_modifiers.order_line_id
      AND public.is_team_member(auth.uid(), ol.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pos_order_lines ol
    WHERE ol.id = order_item_modifiers.order_line_id
      AND public.is_team_member(auth.uid(), ol.user_id)
  )
);