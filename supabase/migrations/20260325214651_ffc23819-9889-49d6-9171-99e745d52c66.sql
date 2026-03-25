
-- Add السخان (grill) kitchen station
INSERT INTO kitchen_stations (id, user_id, name, color, is_active, display_order)
VALUES ('b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', '0b08eba6-c81a-4f6c-b371-e6e324016e73', 'السخان / الجريل', '#EF4444', true, 3)
ON CONFLICT (id) DO NOTHING;

-- Clear existing printers for this user to avoid duplicates
DELETE FROM pos_printers WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73';

-- Insert all 4 printers for فرع سفيان
INSERT INTO pos_printers (user_id, branch_id, name, ip_address, port, printer_type, paper_width, is_default, is_active, station_ids, print_categories)
VALUES
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'ff450748-20b4-4ceb-b77b-40c470f625c4', 'طابعة الوصل (كاش)', '192.168.1.220', 9100, 'escpos', 80, true, true, '{}', '{receipt}'),
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'ff450748-20b4-4ceb-b77b-40c470f625c4', 'طابعة المطبخ', '192.168.1.120', 9100, 'escpos', 72, false, true, '{a09ebd1b-392c-42b2-a8a7-d180fdde1f97}', '{kitchen_ticket}'),
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'ff450748-20b4-4ceb-b77b-40c470f625c4', 'طابعة السخان', '192.168.1.10', 9100, 'escpos', 80, false, true, '{b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e}', '{kitchen_ticket}'),
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'ff450748-20b4-4ceb-b77b-40c470f625c4', 'طابعة البيتزا', '192.168.1.228', 9100, 'escpos', 80, false, true, '{8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516}', '{kitchen_ticket}');
