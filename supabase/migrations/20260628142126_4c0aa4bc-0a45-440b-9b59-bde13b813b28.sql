-- Malaky Broast: remove kitchen/grill/pizza routing for cold/sweet/beverage categories
-- These items should ONLY appear on customer receipt, never on kitchen tickets
DELETE FROM public.pos_category_print_rules
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
  AND category_id IN (
    'b2297392-a167-4875-8c51-72854e2de47b', -- بوظة
    'fd9e1562-f503-4aeb-a4ff-854efa3a5b6b', -- حلويات
    'c6c92ec1-32d7-4660-b883-e1af2658410c', -- مشروبات
    'd05c9a8e-f868-4e9d-963c-7a9525b8e1ab', -- مشروبات باردة
    'c4e72651-c286-4c10-a863-5d13eda0e2e9', -- موهيتو
    'e4e744c2-f377-40e8-a3fe-f0bc217edec7'  -- ميلك شيك
  );