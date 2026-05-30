ALTER TABLE public.pos_user_permissions
  ADD COLUMN IF NOT EXISTS view_payment_details boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_pos_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_manager_for_returns boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.pos_sensitive_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  action text NOT NULL,
  pos_user_id uuid,
  manager_user_id uuid,
  session_id uuid,
  invoice_id uuid,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pos_sensitive_actions_log TO authenticated;
GRANT ALL ON public.pos_sensitive_actions_log TO service_role;

ALTER TABLE public.pos_sensitive_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read pos_sensitive_actions_log"
ON public.pos_sensitive_actions_log
FOR SELECT
TO authenticated
USING (company_id = public.resolve_effective_owner_id(auth.uid()));

CREATE POLICY "tenant insert pos_sensitive_actions_log"
ON public.pos_sensitive_actions_log
FOR INSERT
TO authenticated
WITH CHECK (company_id = public.resolve_effective_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pos_sensitive_actions_company_created
  ON public.pos_sensitive_actions_log(company_id, created_at DESC);