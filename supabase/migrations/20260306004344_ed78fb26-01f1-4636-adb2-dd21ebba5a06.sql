
DROP POLICY IF EXISTS "Users manage own order_item_modifiers" ON public.order_item_modifiers;

CREATE POLICY "Users manage own order_item_modifiers" ON public.order_item_modifiers
  FOR ALL TO authenticated
  USING (
    order_line_id IN (
      SELECT ol.id FROM public.pos_order_lines ol
      JOIN public.pos_orders o ON o.id = ol.order_id
      WHERE o.user_id = auth.uid() OR public.is_team_member(auth.uid(), o.user_id)
    )
  )
  WITH CHECK (
    order_line_id IN (
      SELECT ol.id FROM public.pos_order_lines ol
      JOIN public.pos_orders o ON o.id = ol.order_id
      WHERE o.user_id = auth.uid() OR public.is_team_member(auth.uid(), o.user_id)
    )
  );
