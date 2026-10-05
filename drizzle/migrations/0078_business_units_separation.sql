CREATE TABLE public.business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_units TO authenticated;
GRANT ALL ON public.business_units TO service_role;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team view business units" ON public.business_units FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Owner manage business units" ON public.business_units FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (public.is_team_member((SELECT auth.uid()), user_id) AND public.has_role((SELECT auth.uid()), 'admin')))
  WITH CHECK ((SELECT auth.uid()) = user_id OR (public.is_team_member((SELECT auth.uid()), user_id) AND public.has_role((SELECT auth.uid()), 'admin')));

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL;

CREATE TABLE public.product_business_units (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  business_unit_id uuid NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, business_unit_id)
);
CREATE INDEX idx_pbu_unit ON public.product_business_units(business_unit_id);
CREATE INDEX idx_pbu_user ON public.product_business_units(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_business_units TO authenticated;
GRANT ALL ON public.product_business_units TO service_role;
ALTER TABLE public.product_business_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team view product units" ON public.product_business_units FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Team manage product units" ON public.product_business_units FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_team_member((SELECT auth.uid()), user_id))
  WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_team_member((SELECT auth.uid()), user_id));

COMMENT ON TABLE public.product_business_units IS 'Product visibility per business unit. Product with no rows = shared across all units.';