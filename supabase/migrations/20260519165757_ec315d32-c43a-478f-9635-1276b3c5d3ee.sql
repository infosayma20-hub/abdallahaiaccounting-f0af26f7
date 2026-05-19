-- 1) Rename category
UPDATE public.pos_categories SET name='كرنشي عائلي' WHERE id='411082c6-7c1e-41c7-83e5-c5e42a7bf1f7';

-- 2) Soft delete duplicate orphan product (same as 94ed0589 "وجبة 10 قطع كريسبي")
UPDATE public.products SET is_pos_available=false, is_sold=false WHERE id='f9bd3ded-198d-427e-8f8e-908eb159b952';

-- 3) Add حار/عادي (e9763cf9) to family crispy + salads + arizko meals
INSERT INTO public.product_modifier_groups (product_id, group_id, sort_order)
SELECT pid::uuid, 'e9763cf9-8f30-4b95-a365-52dfd78a3f93'::uuid, 1
FROM (VALUES
  -- كرنشي عائلي (5)
  ('127a18aa-c1b4-4bc9-b5f0-55a01b959e83'),
  ('94ed0589-8dd2-4d9d-ad3a-611881b451c5'),
  ('1b541a5c-6773-46c4-be8e-cf108ae3d6c4'),
  ('cff8ab21-77b6-4745-9e53-bb4dcf3255e8'),
  ('ebbb0007-37f2-4663-8ea6-b90e37143def'),
  -- سلطات (4)
  ('c3e829f5-e868-41be-833f-d9f9b71c62a4'),
  ('da235c5c-1e2b-42f9-b6c9-46abf353c1d9'),
  ('31458eaa-b946-4f66-9e60-50b1e9bf3f4c'),
  ('fd385c9f-5d9f-4dcb-8a41-817c0aa627ab'),
  -- وجبات اريزكو (17)
  ('faf005a3-7f59-411a-9acc-c792700f61ae'),
  ('9b591650-7171-495b-809e-4122157aaf75'),
  ('e099a9a8-1951-4662-87d1-2b8fa0938fc7'),
  ('a8267a83-f7c0-4659-839a-be63bf67913e'),
  ('3761ce3d-c728-4136-9704-ba46405f19e2'),
  ('5d222eed-5083-46df-9080-ba3c437f39ff'),
  ('93f273c8-05c8-4053-ac5a-14ea23f13d64'),
  ('8ed413b4-b59b-4b29-ab62-be2086f62411'),
  ('db76fa40-d315-49d9-9a05-edc46911faee'),
  ('8bd8afc0-e814-4b49-a61b-ce5de9e00588'),
  ('0ae6c440-fce9-4e94-b8a5-8ce5d0551b43'),
  ('bce0867b-95be-4270-bd2b-12beffb3ff99'),
  ('0e89301f-8144-481a-ab40-baaa8abdaf4c'),
  ('e4b3acd7-69e5-40c8-9ef6-928c50afcc62'),
  ('35e4a040-c08f-4e47-ba2c-bb6f8b09868d'),
  ('d690141b-f4f1-4edb-8694-821d517f6189'),
  ('284b578c-a64e-4b8e-9774-b8def6456ade')
) AS v(pid)
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_modifier_groups pmg
  WHERE pmg.product_id = v.pid::uuid AND pmg.group_id='e9763cf9-8f30-4b95-a365-52dfd78a3f93'::uuid
);

-- 4) Add الجبنة (bbd9b5d6) to Royal Fresh burger sandwich + meal
INSERT INTO public.product_modifier_groups (product_id, group_id, sort_order)
SELECT pid::uuid, 'bbd9b5d6-0d62-4a1a-a35a-e268e067cbc8'::uuid, 1
FROM (VALUES
  ('e16aaa3c-635d-455a-8062-fa510175271d'),
  ('d5137ea4-907e-402c-8739-4154a4e93ed2')
) AS v(pid)
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_modifier_groups pmg
  WHERE pmg.product_id = v.pid::uuid AND pmg.group_id='bbd9b5d6-0d62-4a1a-a35a-e268e067cbc8'::uuid
);