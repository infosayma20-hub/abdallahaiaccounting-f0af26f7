DO $$
DECLARE
  extras_category_id uuid := '60152181-f21e-49aa-816c-61d532224818';
  jalapeno_option_id uuid := '35b8cdfa-8421-4582-8e39-8d8529ef9f97';
BEGIN
  DELETE FROM public.modifier_options
  WHERE id = jalapeno_option_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE pos_category_id = extras_category_id
      AND name = 'هلبينو'
  ) THEN
    INSERT INTO public.products (
      id,
      user_id,
      name,
      category,
      sell_price,
      quantity,
      unit,
      is_pos_available,
      pos_category_id,
      is_sold,
      is_purchased,
      is_pos_product,
      product_type,
      service_direction,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      user_id,
      'هلبينو',
      'الإضافات',
      3,
      0,
      'حبة',
      true,
      extras_category_id,
      true,
      false,
      true,
      'service',
      'provided',
      now(),
      now()
    FROM public.pos_categories
    WHERE id = extras_category_id
    LIMIT 1;
  END IF;
END $$;