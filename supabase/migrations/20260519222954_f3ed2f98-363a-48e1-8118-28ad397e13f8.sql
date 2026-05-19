-- 1) Cleanup: per (order_id, station_id) keep one row (prefer the one with display_number, else oldest)
WITH ranked AS (
  SELECT id, order_id, station_id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, station_id
      ORDER BY (display_number IS NULL), created_at ASC
    ) AS rn
  FROM public.kitchen_tickets
)
DELETE FROM public.kitchen_tickets kt
USING ranked r
WHERE kt.id = r.id AND r.rn > 1;

-- 2) Cleanup duplicates across DIFFERENT station_ids for the same order
-- (caused by POSPage picking a different "default" station than the trigger).
-- Strategy: if an order has multiple tickets and one of them lacks display_number
-- AND items lack product_id, treat it as the POSPage row and drop it ONLY if
-- another ticket exists for the same order.
DELETE FROM public.kitchen_tickets kt
WHERE kt.display_number IS NULL
  AND EXISTS (
    SELECT 1 FROM public.kitchen_tickets kt2
    WHERE kt2.order_id = kt.order_id
      AND kt2.id <> kt.id
      AND kt2.display_number IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(kt.items) it
    WHERE it ? 'product_id' AND it->>'product_id' IS NOT NULL
  );

-- 3) Diagnostic function
CREATE OR REPLACE FUNCTION public.kds_debug_order_by_display_number(
  _token text,
  _display_number text
)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  daily_display_number int,
  ticket_count bigint,
  ticket_id uuid,
  station_id uuid,
  station_name text,
  status text,
  created_at timestamptz,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;

  RETURN QUERY
  SELECT po.id, po.order_number, po.daily_display_number,
         (SELECT COUNT(*) FROM public.kitchen_tickets WHERE order_id = po.id),
         kt.id, kt.station_id, ks.name, kt.status, kt.created_at, kt.items
  FROM public.pos_orders po
  LEFT JOIN public.kitchen_tickets kt ON kt.order_id = po.id
  LEFT JOIN public.kitchen_stations ks ON ks.id = kt.station_id
  WHERE po.user_id = _device.company_id
    AND (po.daily_display_number::text = _display_number OR po.order_number = _display_number)
  ORDER BY kt.created_at;
END;
$$;