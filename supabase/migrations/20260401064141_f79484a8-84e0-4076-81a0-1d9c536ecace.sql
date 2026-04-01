
-- Add print_station_ids array to products (multi-station support)
ALTER TABLE products ADD COLUMN IF NOT EXISTS print_station_ids TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrate existing kitchen_station_id data to new array column
UPDATE products SET print_station_ids = ARRAY[kitchen_station_id::TEXT]
WHERE kitchen_station_id IS NOT NULL AND (print_station_ids IS NULL OR array_length(print_station_ids, 1) IS NULL);

-- Update printer types to be more descriptive
-- Receipt printer
UPDATE pos_printers SET printer_type = 'receipt', print_categories = ARRAY['receipt']
WHERE ip_address = '192.168.1.220';

-- Kitchen printer  
UPDATE pos_printers SET printer_type = 'kitchen_ticket', print_categories = ARRAY['kitchen_ticket']
WHERE ip_address = '192.168.1.120';

-- Grill/Sakhan printer
UPDATE pos_printers SET printer_type = 'kitchen_ticket', print_categories = ARRAY['kitchen_ticket']
WHERE ip_address = '192.168.1.10';

-- Pizza printer
UPDATE pos_printers SET printer_type = 'kitchen_ticket', print_categories = ARRAY['kitchen_ticket']
WHERE ip_address = '192.168.1.228';

-- Fix station assignments: السخان printer should have السخان station
UPDATE pos_printers SET station_ids = ARRAY['b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e']::UUID[]
WHERE ip_address = '192.168.1.10';

-- Activate المطبخ الرئيسي station
UPDATE kitchen_stations SET is_active = true WHERE id = 'a09ebd1b-392c-42b2-a8a7-d180fdde1f97';

-- Ensure kitchen printer has the main kitchen station
UPDATE pos_printers SET station_ids = ARRAY['a09ebd1b-392c-42b2-a8a7-d180fdde1f97']::UUID[]
WHERE ip_address = '192.168.1.120';
