
-- pg_trgm lives in the extensions schema on this project; fully qualify.
CREATE INDEX IF NOT EXISTS idx_delivery_zones_area_name_trgm
  ON public.delivery_zones USING gin (area_name extensions.gin_trgm_ops)
  WHERE wheels_area_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.match_wheels_zone_fuzzy(
  p_user_id uuid,
  p_branch_id uuid,
  p_candidate text,
  p_threshold real DEFAULT 0.4
)
RETURNS TABLE (
  area_name text,
  wheels_area_id integer,
  wheels_fixed_price numeric,
  score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    dz.area_name,
    dz.wheels_area_id,
    dz.wheels_fixed_price,
    extensions.similarity(dz.area_name, p_candidate) AS score
  FROM public.delivery_zones dz
  WHERE dz.user_id = p_user_id
    AND dz.branch_id = p_branch_id
    AND dz.wheels_area_id IS NOT NULL
    AND extensions.similarity(dz.area_name, p_candidate) >= p_threshold
  ORDER BY extensions.similarity(dz.area_name, p_candidate) DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.match_wheels_zone_fuzzy(uuid, uuid, text, real) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wheels_unmatched_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid,
  order_id uuid,
  customer_address text,
  candidates text[] NOT NULL DEFAULT '{}',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.wheels_unmatched_areas TO authenticated;
GRANT ALL ON public.wheels_unmatched_areas TO service_role;

ALTER TABLE public.wheels_unmatched_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_read_own_unmatched" ON public.wheels_unmatched_areas;
CREATE POLICY "tenants_read_own_unmatched"
  ON public.wheels_unmatched_areas
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tenants_update_own_unmatched" ON public.wheels_unmatched_areas;
CREATE POLICY "tenants_update_own_unmatched"
  ON public.wheels_unmatched_areas
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wheels_unmatched_user_created
  ON public.wheels_unmatched_areas (user_id, created_at DESC);
