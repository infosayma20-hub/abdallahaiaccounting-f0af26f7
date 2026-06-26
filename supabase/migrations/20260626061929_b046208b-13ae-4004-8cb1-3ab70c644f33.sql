CREATE OR REPLACE FUNCTION public.qr_menu_get_menu(_user_id uuid, _branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ok boolean;
  _result jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM branches b
    JOIN company_settings cs ON cs.user_id = b.user_id
    WHERE b.id = _branch_id AND b.user_id = _user_id
      AND b.qr_menu_enabled AND cs.qr_menu_enabled
  ) INTO _ok;
  IF NOT _ok THEN RETURN '{"error":"not_available"}'::jsonb; END IF;

  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order) ORDER BY sort_order NULLS LAST, name)
      FROM pos_categories
      WHERE user_id = _user_id
        AND COALESCE(show_in_qr_menu, true) = true
        AND COALESCE(is_active, true) = true
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'price', p.sell_price,
        'image_url', p.image_url,
        'category_id', p.pos_category_id,
        'description', p.description,
        'modifier_groups', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mg.id,
            'name', mg.name,
            'selection_type', mg.selection_type,
            'is_required', mg.is_required,
            'min_select', mg.min_select,
            'max_select', mg.max_select,
            'options', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', mo.id,
                'name', mo.name,
                'extra_price', mo.extra_price,
                'is_default', mo.is_default
              ) ORDER BY mo.sort_order NULLS LAST, mo.name)
              FROM modifier_options mo
              WHERE mo.group_id = mg.id AND COALESCE(mo.is_active, true) = true
            ), '[]'::jsonb)
          ) ORDER BY pmg.sort_order NULLS LAST, mg.sort_order NULLS LAST, mg.name)
          FROM product_modifier_groups pmg
          JOIN modifier_groups mg ON mg.id = pmg.group_id
          WHERE pmg.product_id = p.id
            AND mg.user_id = _user_id
            AND COALESCE(mg.is_active, true) = true
        ), '[]'::jsonb)
      ) ORDER BY p.pos_sort_order NULLS LAST, p.name)
      FROM products p
      WHERE p.user_id = _user_id
        AND COALESCE(p.show_in_qr_menu, true) = true
        AND COALESCE(p.is_pos_available, true) = true
        AND p.pos_category_id IS NOT NULL
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END $$;

GRANT EXECUTE ON FUNCTION public.qr_menu_get_menu(uuid, uuid) TO anon, authenticated;