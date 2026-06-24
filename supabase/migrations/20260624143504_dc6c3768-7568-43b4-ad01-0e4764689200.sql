
CREATE TABLE public.pos_product_force_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  branch_id uuid NULL,
  product_id uuid NOT NULL,
  station_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pos_pfs_unique
  ON public.pos_product_force_stations (
    user_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    product_id,
    station_id
  );

CREATE INDEX pos_pfs_user_idx ON public.pos_product_force_stations(user_id);
CREATE INDEX pos_pfs_product_idx ON public.pos_product_force_stations(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_product_force_stations TO authenticated;
GRANT ALL ON public.pos_product_force_stations TO service_role;

ALTER TABLE public.pos_product_force_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages product force stations"
  ON public.pos_product_force_stations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
