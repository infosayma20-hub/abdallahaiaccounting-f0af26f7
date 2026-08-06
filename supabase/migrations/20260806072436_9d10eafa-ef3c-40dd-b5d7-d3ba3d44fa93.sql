DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.pos_orders
    WHERE created_at > now() - interval '24 hours'
      AND COALESCE(state,'') <> 'cancelled'
      AND cancelled_at IS NULL
    ORDER BY created_at
  LOOP
    PERFORM public.pos_sync_order_tracking(r.id);
  END LOOP;
END $$;