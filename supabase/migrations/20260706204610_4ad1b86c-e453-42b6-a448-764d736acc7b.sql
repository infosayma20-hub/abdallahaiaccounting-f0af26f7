GRANT SELECT ON public.pos_categories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.modifier_groups TO anon;
GRANT SELECT ON public.modifier_options TO anon;
GRANT SELECT ON public.product_modifier_groups TO anon;

DROP POLICY IF EXISTS "Anon can view kiosk categories" ON public.pos_categories;
CREATE POLICY "Anon can view kiosk categories"
  ON public.pos_categories
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.kiosk_settings ks
      WHERE ks.user_id = pos_categories.user_id
        AND ks.is_active = true
    )
  );

DROP POLICY IF EXISTS "Anon can view kiosk products" ON public.products;
CREATE POLICY "Anon can view kiosk products"
  ON public.products
  FOR SELECT
  TO anon
  USING (
    COALESCE(is_pos_available, false) = true
    AND EXISTS (
      SELECT 1
      FROM public.kiosk_settings ks
      WHERE ks.user_id = products.user_id
        AND ks.is_active = true
    )
  );

DROP POLICY IF EXISTS "Anon can view kiosk modifier groups" ON public.modifier_groups;
CREATE POLICY "Anon can view kiosk modifier groups"
  ON public.modifier_groups
  FOR SELECT
  TO anon
  USING (
    COALESCE(is_active, true) = true
    AND EXISTS (
      SELECT 1
      FROM public.kiosk_settings ks
      WHERE ks.user_id = modifier_groups.user_id
        AND ks.is_active = true
    )
  );

DROP POLICY IF EXISTS "Anon can view kiosk modifier options" ON public.modifier_options;
CREATE POLICY "Anon can view kiosk modifier options"
  ON public.modifier_options
  FOR SELECT
  TO anon
  USING (
    COALESCE(is_active, true) = true
    AND EXISTS (
      SELECT 1
      FROM public.modifier_groups mg
      JOIN public.kiosk_settings ks ON ks.user_id = mg.user_id AND ks.is_active = true
      WHERE mg.id = modifier_options.group_id
        AND COALESCE(mg.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS "Anon can view kiosk product modifier groups" ON public.product_modifier_groups;
CREATE POLICY "Anon can view kiosk product modifier groups"
  ON public.product_modifier_groups
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.kiosk_settings ks ON ks.user_id = p.user_id AND ks.is_active = true
      WHERE p.id = product_modifier_groups.product_id
        AND COALESCE(p.is_pos_available, false) = true
    )
  );