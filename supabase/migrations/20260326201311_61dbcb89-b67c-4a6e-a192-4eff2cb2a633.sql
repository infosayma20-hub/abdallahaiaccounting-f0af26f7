-- Fix workshop_payments RLS to use is_team_member for team consistency
DROP POLICY IF EXISTS "Users can manage their workshop payments" ON public.workshop_payments;

CREATE POLICY "workshop_payments_select" ON public.workshop_payments FOR SELECT USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "workshop_payments_insert" ON public.workshop_payments FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "workshop_payments_update" ON public.workshop_payments FOR UPDATE USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "workshop_payments_delete" ON public.workshop_payments FOR DELETE USING (public.is_team_member(auth.uid(), user_id));