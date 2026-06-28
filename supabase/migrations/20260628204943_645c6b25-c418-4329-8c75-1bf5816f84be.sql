
-- 1) sparta_audit_log table
CREATE TABLE IF NOT EXISTS public.sparta_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  actor uuid,
  action text NOT NULL,
  entity text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sparta_audit_log TO authenticated;
GRANT ALL ON public.sparta_audit_log TO service_role;

ALTER TABLE public.sparta_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_read_admins"
  ON public.sparta_audit_log FOR SELECT
  TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND holding_id = public.sparta_holding_id());

CREATE POLICY "audit_log_insert_members"
  ON public.sparta_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_holding_member(holding_id));

CREATE INDEX IF NOT EXISTS sparta_audit_log_holding_created_idx
  ON public.sparta_audit_log (holding_id, created_at DESC);

-- 2) Allow holding admins to manage members (currently only SELECT exists)
DROP POLICY IF EXISTS "holding_members_admin_write" ON public.holding_members;
CREATE POLICY "holding_members_admin_write"
  ON public.holding_members FOR ALL
  TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND holding_id = public.sparta_holding_id())
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()) AND holding_id = public.sparta_holding_id());

-- 3) Allow holding admins to manage subsidiaries (holding_companies)
DROP POLICY IF EXISTS "holding_companies_admin_write" ON public.holding_companies;
CREATE POLICY "holding_companies_admin_write"
  ON public.holding_companies FOR ALL
  TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND holding_id = public.sparta_holding_id())
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()) AND holding_id = public.sparta_holding_id());

-- 4) Allow holding admins to update holdings settings
DROP POLICY IF EXISTS "holdings_admin_update" ON public.holdings;
CREATE POLICY "holdings_admin_update"
  ON public.holdings FOR UPDATE
  TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND id = public.sparta_holding_id())
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()) AND id = public.sparta_holding_id());
