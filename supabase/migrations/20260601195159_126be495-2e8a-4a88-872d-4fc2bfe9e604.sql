-- 1) حذف "وجبة بروست 3 قطع فخاد" (27) المكرر
DELETE FROM product_modifier_groups WHERE product_id='dff02da7-38c3-4598-9c62-efdb7c4240dc';
DELETE FROM products WHERE id='dff02da7-38c3-4598-9c62-efdb7c4240dc';

-- 2) حذف "وجبة بروست فخاد" المكرر (orphan)
DELETE FROM product_modifier_groups WHERE product_id='2dfe0a99-2646-45d1-b911-de5b76a71b73';
DELETE FROM products WHERE id='2dfe0a99-2646-45d1-b911-de5b76a71b73';

-- 3) تحديث أسعار خيارات "نوع الجوسي" — جميعها 5 شيكل
UPDATE modifier_options SET extra_price=5
WHERE group_id='4076fea0-500c-468a-959d-3aa624fc6b54';

-- 4) جبنة سائلة صغير = 6 (كان 14)؛ الكبير يضيف +8 ليصبح المجموع 14
UPDATE products SET sell_price=6 WHERE id='d539a007-f018-4474-a595-4ea111f06bc7';
UPDATE modifier_options SET extra_price=8
WHERE id='b92faf80-8945-44ec-a00f-9e00c8e32b94';

-- 5) إضافة منتج جديد "سفينة + قطعتين كرسبي" بسعر 27 في فئة بروست فردي
INSERT INTO products (id, user_id, name, sell_price, buy_price, quantity, unit, pos_category_id,
                     is_pos_available, is_sold, is_purchased, is_pos_product, sort_order, tax_rate, product_type)
VALUES (gen_random_uuid(), '0b08eba6-c81a-4f6c-b371-e6e324016e73', 'سفينة + قطعتين كرسبي',
        27, 0, 0, 'قطعة', '8af33f26-69ca-4839-b369-121684f2ff6b',
        true, true, false, false, 182, 0, 'product');

-- 6) إضافة "هلبينو" بسعر 3 شيكل لمجموعة "الجبنة" (اضافات)
INSERT INTO modifier_options (id, group_id, name, extra_price, is_default, sort_order, is_active)
VALUES (gen_random_uuid(), 'bbd9b5d6-0d62-4a1a-a35a-e268e067cbc8', 'هلبينو', 3, false, 99, true);