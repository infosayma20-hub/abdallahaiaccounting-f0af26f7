CREATE POLICY "cashier_inserts_own_audit" ON public.pos_shift_audits FOR INSERT TO authenticated
WITH CHECK (cashier_auth_user_id = (SELECT auth.uid()) AND public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "cashier_updates_own_pending_audit" ON public.pos_shift_audits FOR UPDATE TO authenticated
USING (cashier_auth_user_id = (SELECT auth.uid()) AND status = 'pending')
WITH CHECK (cashier_auth_user_id = (SELECT auth.uid()) AND status = 'pending' AND public.is_team_member((SELECT auth.uid()), user_id));