INSERT INTO public.product_modifier_groups (product_id, group_id, sort_order)
SELECT p.id, 'e9763cf9-8f30-4b95-a365-52dfd78a3f93'::uuid, 1
FROM public.products p
WHERE p.pos_category_id='ba4488b3-1f32-490d-8f3a-5185783c89fe'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_modifier_groups x
    WHERE x.product_id=p.id AND x.group_id='e9763cf9-8f30-4b95-a365-52dfd78a3f93'
  );