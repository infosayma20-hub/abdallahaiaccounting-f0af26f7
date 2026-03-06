
-- Also fix: update any tables currently stuck in 'cleaning' status
UPDATE public.restaurant_tables SET status = 'available', current_order_id = NULL, current_guests = 0, occupied_at = NULL WHERE status = 'cleaning';
