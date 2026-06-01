
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  city text NOT NULL,
  area_name text NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  branch_name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dz_user_city ON public.delivery_zones(user_id, city, is_active);
CREATE INDEX idx_dz_branch ON public.delivery_zones(branch_id);
CREATE UNIQUE INDEX uq_dz_user_branch_area ON public.delivery_zones(user_id, branch_id, area_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage delivery_zones"
  ON public.delivery_zones FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team members can view delivery_zones"
  ON public.delivery_zones FOR SELECT
  TO authenticated
  USING (user_id = (SELECT public.get_team_owner_id(auth.uid())));

CREATE POLICY "Team members can manage delivery_zones"
  ON public.delivery_zones FOR ALL
  TO authenticated
  USING (user_id = (SELECT public.get_team_owner_id(auth.uid())))
  WITH CHECK (user_id = (SELECT public.get_team_owner_id(auth.uid())));

CREATE TRIGGER trg_delivery_zones_updated_at
  BEFORE UPDATE ON public.delivery_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
