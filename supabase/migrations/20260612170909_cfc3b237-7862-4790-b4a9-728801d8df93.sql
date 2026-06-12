CREATE TABLE public.wheels_branch_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  wheels_branch_id text NOT NULL,
  secret_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wheels_branch_config TO authenticated;
GRANT ALL ON public.wheels_branch_config TO service_role;

ALTER TABLE public.wheels_branch_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages wheels_branch_config"
ON public.wheels_branch_config FOR ALL TO authenticated
USING (auth.uid() = user_id OR user_id = (SELECT public.get_team_owner_id(auth.uid())))
WITH CHECK (auth.uid() = user_id OR user_id = (SELECT public.get_team_owner_id(auth.uid())));

CREATE TRIGGER trg_wheels_branch_config_updated_at
BEFORE UPDATE ON public.wheels_branch_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS wheels_area_id integer,
  ADD COLUMN IF NOT EXISTS wheels_fixed_price numeric;

CREATE INDEX IF NOT EXISTS idx_dz_wheels_area
  ON public.delivery_zones(branch_id, wheels_area_id)
  WHERE wheels_area_id IS NOT NULL;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS wheels_request_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS wheels_response jsonb,
  ADD COLUMN IF NOT EXISTS wheels_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS wheels_last_error text,
  ADD COLUMN IF NOT EXISTS wheels_delivery_price numeric;

ALTER TABLE public.pos_orders
  DROP CONSTRAINT IF EXISTS pos_orders_wheels_status_chk;
ALTER TABLE public.pos_orders
  ADD CONSTRAINT pos_orders_wheels_status_chk
  CHECK (wheels_request_status IN ('not_sent','sending','sent','failed'));