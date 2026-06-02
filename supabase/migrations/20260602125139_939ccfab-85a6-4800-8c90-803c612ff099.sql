
DO $$
DECLARE
  v_user uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_group uuid;
BEGIN
  INSERT INTO public.modifier_groups (user_id, name, selection_type, is_required, min_select, max_select, sort_order, is_active)
  VALUES (v_user, 'استبدال', 'multiple', false, 0, 2, 50, true)
  RETURNING id INTO v_group;

  INSERT INTO public.modifier_options (group_id, name, extra_price, is_active, sort_order, is_default)
  VALUES
    (v_group, 'استبدال قطعة بسفينة', 5, true, 1, false),
    (v_group, 'استبدال قطعة بورك', 3, true, 2, false);

  INSERT INTO public.product_modifier_groups (product_id, group_id, sort_order)
  SELECT p.id, v_group, 50
  FROM public.products p
  WHERE p.pos_category_id IN (
    '632a2ba8-1082-442c-b307-9a1c6b08f02c',
    '6df9486f-d1a7-435c-9cb6-f493161561e2',
    '8af33f26-69ca-4839-b369-121684f2ff6b',
    '455dee25-2b26-4d9e-9a59-0084ffd3833d'
  )
  AND p.name NOT LIKE '%جوسي%'
  ON CONFLICT (product_id, group_id) DO NOTHING;
END $$;
