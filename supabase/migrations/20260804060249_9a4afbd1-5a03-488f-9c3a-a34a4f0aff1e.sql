DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
CREATE POLICY "Team can view order items"
ON public.order_items FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid(), user_id));