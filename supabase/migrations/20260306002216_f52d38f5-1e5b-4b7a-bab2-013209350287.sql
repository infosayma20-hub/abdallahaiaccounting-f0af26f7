-- Cancel orphaned draft orders for T1 and clean up
UPDATE pos_orders SET state = 'cancelled' WHERE table_id = '215aadb3-fb31-4445-8f09-8ad40f83946e' AND state IN ('draft', 'open');

-- Also ensure T1 table is fully clean
UPDATE restaurant_tables SET status = 'available', current_order_id = NULL, current_guests = 0, occupied_at = NULL WHERE id = '215aadb3-fb31-4445-8f09-8ad40f83946e';