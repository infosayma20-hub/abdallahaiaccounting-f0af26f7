
ALTER TABLE public._backup_hybrid_contacts_20260706 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_hybrid_accounts_20260706 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_hybrid_transactions_20260706 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._backup_hybrid_contacts_20260706 FROM anon, authenticated;
REVOKE ALL ON public._backup_hybrid_accounts_20260706 FROM anon, authenticated;
REVOKE ALL ON public._backup_hybrid_transactions_20260706 FROM anon, authenticated;
GRANT ALL ON public._backup_hybrid_contacts_20260706 TO service_role;
GRANT ALL ON public._backup_hybrid_accounts_20260706 TO service_role;
GRANT ALL ON public._backup_hybrid_transactions_20260706 TO service_role;

CREATE POLICY "backup_admin_only_contacts" ON public._backup_hybrid_contacts_20260706
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "backup_admin_only_accounts" ON public._backup_hybrid_accounts_20260706
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "backup_admin_only_tx" ON public._backup_hybrid_transactions_20260706
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
