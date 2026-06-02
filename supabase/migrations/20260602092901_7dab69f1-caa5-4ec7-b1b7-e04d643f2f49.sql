
INSERT INTO public.modifier_groups (id, user_id, name, selection_type, is_required, min_select, max_select, sort_order, is_active)
VALUES (
  '8b4a1e5f-3d3b-4f1e-ae22-dc33bb992020',
  '0b08eba6-c81a-4f6c-b371-e6e324016e73',
  'الحجم - بيتزا نصفين بدون كرسبي',
  'single', true, 1, 1, 1, true
);

INSERT INTO public.modifier_options (group_id, name, extra_price, is_default, sort_order, is_active) VALUES
('8b4a1e5f-3d3b-4f1e-ae22-dc33bb992020', 'S',  25, true,  1, true),
('8b4a1e5f-3d3b-4f1e-ae22-dc33bb992020', 'M',  40, false, 2, true),
('8b4a1e5f-3d3b-4f1e-ae22-dc33bb992020', 'L',  50, false, 3, true),
('8b4a1e5f-3d3b-4f1e-ae22-dc33bb992020', 'XL', 60, false, 4, true);

UPDATE public.product_modifier_groups
SET group_id='8b4a1e5f-3d3b-4f1e-ae22-dc33bb992020'
WHERE product_id='3605f70e-fe70-452e-8bee-900e9bb3c970'
  AND group_id='f3fc4bd9-79ef-49c3-b4b9-ad8c62c74164';
