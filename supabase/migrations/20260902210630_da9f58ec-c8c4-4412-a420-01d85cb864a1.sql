DO $$
DECLARE
  v_cat uuid;
  v_station uuid := 'a09ebd1b-392c-42b2-a8a7-d180fdde1f97'; -- المطبخ الرئيسي
  v_plaza uuid := 'f82642e1-ce32-456e-8ef8-e556d8d65af9';   -- رام الله بلازا مول
  v_owner uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
BEGIN
  SELECT id INTO v_cat FROM pos_categories WHERE name = 'بيتزا' LIMIT 1;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'pizza category not found';
  END IF;

  -- احذف القاعدة العامة (لكل الفروع)
  DELETE FROM pos_category_print_rules
  WHERE category_id = v_cat AND station_id = v_station AND branch_id IS NULL;

  -- أعد إنشائها كقواعد مخصصة لكل فرع ما عدا بلازا مول
  INSERT INTO pos_category_print_rules (branch_id, category_id, station_id, user_id)
  SELECT b.id, v_cat, v_station, v_owner
  FROM branches b
  WHERE b.user_id = v_owner AND b.id <> v_plaza
    AND NOT EXISTS (
      SELECT 1 FROM pos_category_print_rules r
      WHERE r.branch_id = b.id AND r.category_id = v_cat AND r.station_id = v_station
    );
END $$;