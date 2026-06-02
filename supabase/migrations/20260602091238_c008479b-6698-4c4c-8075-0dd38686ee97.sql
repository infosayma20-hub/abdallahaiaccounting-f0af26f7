DO $$
DECLARE
  v_new_group uuid;
BEGIN
  INSERT INTO modifier_groups (name, selection_type, is_required, user_id)
  VALUES ('الحجم - متومة', 'single', true, '0b08eba6-c81a-4f6c-b371-e6e324016e73')
  RETURNING id INTO v_new_group;

  INSERT INTO modifier_options (group_id, name, extra_price, sort_order) VALUES
    (v_new_group, 'صغير', 2,  0),
    (v_new_group, 'وسط',  5,  1),
    (v_new_group, 'كبير', 10, 2);

  INSERT INTO product_modifier_groups (product_id, group_id)
  VALUES ('81f81a94-4215-47ee-9f3d-063241f8cba1', v_new_group);

  DELETE FROM product_modifier_groups
  WHERE product_id='81f81a94-4215-47ee-9f3d-063241f8cba1'
    AND group_id='2ce8dd09-7bd6-494c-b6a6-9bcb0721d965';

  UPDATE products SET sell_price=0 WHERE id='81f81a94-4215-47ee-9f3d-063241f8cba1';
END $$;