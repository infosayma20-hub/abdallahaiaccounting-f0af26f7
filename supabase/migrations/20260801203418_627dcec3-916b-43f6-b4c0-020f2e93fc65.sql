ALTER TABLE public.kiosk_settings ADD COLUMN IF NOT EXISTS access_code text;

UPDATE public.kiosk_settings
SET access_code = lower(replace(gen_random_uuid()::text, '-', ''))
WHERE access_code IS NULL;

ALTER TABLE public.kiosk_settings ALTER COLUMN access_code SET DEFAULT lower(replace(gen_random_uuid()::text, '-', ''));
ALTER TABLE public.kiosk_settings ALTER COLUMN access_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kiosk_settings_access_code_key ON public.kiosk_settings (access_code);

CREATE OR REPLACE FUNCTION public.get_kiosk_bootstrap(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ks public.kiosk_settings%ROWTYPE;
  v_logo text;
  v_result jsonb;
BEGIN
  SELECT * INTO ks FROM public.kiosk_settings
  WHERE access_code = lower(trim(p_code)) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT logo_url INTO v_logo FROM public.company_settings WHERE user_id = ks.user_id LIMIT 1;

  v_result := jsonb_build_object(
    'ok', true,
    'settings', jsonb_build_object(
      'id', ks.id,
      'user_id', ks.user_id,
      'branch_id', ks.branch_id,
      'is_active', ks.is_active,
      'default_language', ks.default_language,
      'welcome_image_url', ks.welcome_image_url,
      'logo_url', ks.logo_url,
      'primary_color', ks.primary_color,
      'idle_timeout_seconds', ks.idle_timeout_seconds,
      'receipt_printer_id', ks.receipt_printer_id,
      'require_phone', ks.require_phone,
      'require_name', ks.require_name
    ),
    'company_logo', v_logo,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'display_order', c.display_order) ORDER BY c.display_order NULLS LAST, c.name)
      FROM public.pos_categories c WHERE c.user_id = ks.user_id AND c.is_active = true
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'price', p.sell_price, 'image_url', p.image_url,
        'category_id', p.pos_category_id, 'is_pos_available', p.is_pos_available, 'description', p.description))
      FROM public.products p WHERE p.user_id = ks.user_id AND p.is_pos_available = true
    ), '[]'::jsonb),
    'product_modifier_groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('product_id', pmg.product_id, 'group_id', pmg.group_id))
      FROM public.product_modifier_groups pmg
      JOIN public.products p2 ON p2.id = pmg.product_id AND p2.user_id = ks.user_id
    ), '[]'::jsonb),
    'modifier_groups', COALESCE((
      SELECT jsonb_agg(to_jsonb(g)) FROM public.modifier_groups g
      WHERE g.user_id = ks.user_id AND COALESCE(g.is_active, true) = true
    ), '[]'::jsonb),
    'modifier_options', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.sort_order NULLS LAST)
      FROM public.modifier_options o
      JOIN public.modifier_groups g2 ON g2.id = o.group_id AND g2.user_id = ks.user_id
      WHERE COALESCE(o.is_active, true) = true
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kiosk_bootstrap(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kiosk_bootstrap(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rotate_kiosk_access_code(p_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  UPDATE public.kiosk_settings ks
  SET access_code = lower(replace(gen_random_uuid()::text, '-', '')), updated_at = now()
  WHERE ks.branch_id = p_branch_id
    AND (ks.user_id = auth.uid() OR (public.is_team_member(auth.uid(), ks.user_id) AND public.user_can_access(auth.uid(), 'pos')))
  RETURNING ks.access_code INTO v_code;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_kiosk_access_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_kiosk_access_code(uuid) TO authenticated, service_role;