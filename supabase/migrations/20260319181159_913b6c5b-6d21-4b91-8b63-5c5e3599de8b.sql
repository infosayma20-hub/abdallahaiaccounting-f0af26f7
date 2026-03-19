
CREATE OR REPLACE FUNCTION public.generate_pos_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_cutoff_hour INTEGER := 6;
  v_business_date DATE;
BEGIN
  -- Calculate business date: if before 6 AM, it belongs to previous day
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- Count orders for this session's user on this business date (6AM-6AM window)
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.pos_orders
  WHERE user_id = NEW.user_id
    AND created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
    AND created_at < (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';

  NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;
