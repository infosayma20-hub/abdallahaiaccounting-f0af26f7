-- 1) Merge duplicate "إضافات" categories: assign كولسلو and خبز to pos_category 'الإضافات'
UPDATE products
SET pos_category_id = '60152181-f21e-49aa-816c-61d532224818'
WHERE id IN ('9ff37405-afe5-4bb8-b86e-92bc0cb5b0ea','5458aed1-8135-44b9-8380-5bc98e1b7a2d');

-- 2) Consolidate "مكس عائلي بروست + كرنشي": rename pos_category and move the 11+11 product to it
UPDATE pos_categories
SET name = 'مكس عائلي بروست + كرنشي'
WHERE id = 'a3eb8ede-67e2-4acf-b334-0d8266a274a3';

UPDATE products
SET pos_category_id = 'a3eb8ede-67e2-4acf-b334-0d8266a274a3',
    category = 'مكس عائلي بروست + كرنشي'
WHERE id IN (
  'f0ef7e84-b17e-4a8b-9fe5-028f46e09167', -- 11+11
  '97fc3744-1a89-4b0d-8975-db77886ec555', -- 5+6
  '5a1ce247-cff7-422d-88ab-6f356329e299', -- 9+9
  '8b4512cf-a6de-4346-b2e6-8aafb4ab3037'  -- 13+13
);

-- 3) Remove حار/عادي modifier groups from all Arizko meals
DELETE FROM product_modifier_groups
WHERE product_id IN (
  'bce0867b-95be-4270-bd2b-12beffb3ff99', -- اريزكو قطعة بروست+2قطع كرسبي
  '284b578c-a64e-4b8e-9774-b8def6456ade', -- اريزكو قطعة بروست+2قطع كرنشي
  '8ed413b4-b59b-4b29-ab62-be2086f62411', -- وجبة اريزكو 3قطع بروست
  '0e89301f-8144-481a-ab40-baaa8abdaf4c', -- وجبة اريزكو مع 3قطع كرسبي
  'a8267a83-f7c0-4659-839a-be63bf67913e', -- وجبة اريزكو مع 3قطع كرنشي
  '5d222eed-5083-46df-9080-ba3c437f39ff'  -- وجبة اريزكو مع 3قطع مسحب مشوي
)
AND group_id IN (
  'b28a3a98-4d60-4b97-a268-54a8208fc2ba',
  '5bd72fc2-7e5f-4840-87f8-a373a3edc729',
  '0e996c04-c4a5-43ff-83ef-31cab8516045',
  'e9763cf9-8f30-4b95-a365-52dfd78a3f93',
  '3255691b-421b-48de-aec2-01d1d127bc76',
  '818e9e1f-69ba-4ffb-9cfd-d2b144e9162a',
  '6b910944-c18c-4b70-948c-1d891cf08c21'
);