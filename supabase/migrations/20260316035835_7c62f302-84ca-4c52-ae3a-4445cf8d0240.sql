
-- Drop the problematic ALL policy and replace with separate policies
DROP POLICY IF EXISTS "Team members can manage order items" ON public.procurement_order_items;

-- SELECT policy: team members can read order items
CREATE POLICY "Team members can read order items"
ON public.procurement_order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM procurement_orders o
    WHERE o.id = procurement_order_items.order_id
    AND is_team_member(auth.uid(), o.user_id)
  )
);

-- INSERT policy: authenticated users can insert order items for their orders
CREATE POLICY "Team members can insert order items"
ON public.procurement_order_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM procurement_orders o
    WHERE o.id = order_id
    AND is_team_member(auth.uid(), o.user_id)
  )
);

-- UPDATE policy
CREATE POLICY "Team members can update order items"
ON public.procurement_order_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM procurement_orders o
    WHERE o.id = procurement_order_items.order_id
    AND is_team_member(auth.uid(), o.user_id)
  )
);

-- DELETE policy
CREATE POLICY "Team members can delete order items"
ON public.procurement_order_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM procurement_orders o
    WHERE o.id = procurement_order_items.order_id
    AND is_team_member(auth.uid(), o.user_id)
  )
);
