UPDATE public.pos_categories
SET is_active = false, updated_at = now()
WHERE id IN (
  '4ad43442-1f88-42bf-b0c1-3a69e390c827', -- مشروبات ساخنة (1)
  'e0998ad4-0299-488c-9f1c-72a71aba51b0', -- مشروبات ساخنة (2)
  '4cc0d0ae-442d-4b46-b0dc-acf7752486c9', -- الطلب من المطبخ
  '0f0e33a7-12fd-40e9-8ef6-fe094f840d27', -- عرض الدفى الملكي
  'e504fb55-8ecc-45ef-be6d-02e3943e7727', -- عروض الشتاء
  '8ca0309f-becd-40cb-863f-23af5be79bb3'  -- رمضان 2026
);