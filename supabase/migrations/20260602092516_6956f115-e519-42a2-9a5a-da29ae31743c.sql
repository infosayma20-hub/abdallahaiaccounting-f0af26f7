
-- 1) Rename shared size options to English-only labels (applies wherever this shared group is used)
UPDATE public.modifier_options SET name='MS' WHERE id='101fd31d-35d0-4895-babe-5fd367ee62eb';
UPDATE public.modifier_options SET name='S'  WHERE id='f61ef923-d496-4757-a46c-e1770f1ace1c';
UPDATE public.modifier_options SET name='M'  WHERE id='5af072d9-6687-4cbe-964c-056065f02c49';
UPDATE public.modifier_options SET name='L'  WHERE id='7925b5aa-3295-441b-9828-1654713bd0b4';
UPDATE public.modifier_options SET name='XL' WHERE id='51d8cec7-53b2-48a2-bb94-1a3eb5c2cd09';

-- 2) Create dedicated size group for "بيتزا نصفين مع كرسبي" (no MS, custom prices, includes XL خضار)
INSERT INTO public.modifier_groups (id, user_id, name, selection_type, is_required, min_select, max_select, sort_order, is_active)
VALUES (
  '7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010',
  '0b08eba6-c81a-4f6c-b371-e6e324016e73',
  'الحجم - بيتزا نصفين مع كرسبي',
  'single', true, 1, 1, 1, true
);

INSERT INTO public.modifier_options (group_id, name, extra_price, is_default, sort_order, is_active) VALUES
('7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010', 'S',         28, true,  1, true),
('7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010', 'M',         50, false, 2, true),
('7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010', 'L',         60, false, 3, true),
('7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010', 'XL',        70, false, 4, true),
('7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010', 'XL خضار',   75, false, 5, true);

-- 3) Swap product link from shared size group to the new dedicated group
UPDATE public.product_modifier_groups
SET group_id='7a3f0d4e-2c2a-4f0e-9d11-cb22aa991010'
WHERE product_id='871b5be1-f52f-4e83-99f7-5db514d097da'
  AND group_id='f3fc4bd9-79ef-49c3-b4b9-ad8c62c74164';
