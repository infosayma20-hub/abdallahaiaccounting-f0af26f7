INSERT INTO public.product_modifier_groups (product_id, group_id, sort_order)
SELECT '66b1dc0d-ec63-4bbe-b6e5-dffec390a163'::uuid, pmg.group_id, pmg.sort_order
FROM public.product_modifier_groups pmg
WHERE pmg.product_id = 'a6410b6b-b240-43b3-8f46-1307bb9185bc'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_modifier_groups x
    WHERE x.product_id = '66b1dc0d-ec63-4bbe-b6e5-dffec390a163'::uuid
      AND x.group_id = pmg.group_id
  );