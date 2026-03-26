
-- Fix procurement_request_items: scope to parent request owner via team membership
DROP POLICY IF EXISTS "Users can view their procurement request items" ON public.procurement_request_items;
DROP POLICY IF EXISTS "Users can insert procurement request items" ON public.procurement_request_items;
DROP POLICY IF EXISTS "Users can update their procurement request items" ON public.procurement_request_items;
DROP POLICY IF EXISTS "Users can delete their procurement request items" ON public.procurement_request_items;

CREATE POLICY "Team can view procurement request items" ON public.procurement_request_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.procurement_requests pr
      WHERE pr.id = procurement_request_items.request_id
      AND public.is_team_member(auth.uid(), pr.owner_id)
    )
  );

CREATE POLICY "Team can insert procurement request items" ON public.procurement_request_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.procurement_requests pr
      WHERE pr.id = procurement_request_items.request_id
      AND public.is_team_member(auth.uid(), pr.owner_id)
    )
  );

CREATE POLICY "Team can update procurement request items" ON public.procurement_request_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.procurement_requests pr
      WHERE pr.id = procurement_request_items.request_id
      AND public.is_team_member(auth.uid(), pr.owner_id)
    )
  );

CREATE POLICY "Team can delete procurement request items" ON public.procurement_request_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.procurement_requests pr
      WHERE pr.id = procurement_request_items.request_id
      AND public.is_team_member(auth.uid(), pr.owner_id)
    )
  )
