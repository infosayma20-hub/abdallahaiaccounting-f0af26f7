
-- Add display_number (obfuscated for customer) and queue_number (1-50 cycling) to pos_orders
ALTER TABLE public.pos_orders 
ADD COLUMN IF NOT EXISTS display_number TEXT,
ADD COLUMN IF NOT EXISTS queue_number INTEGER;

-- Function to generate obfuscated display number and cycling queue number
CREATE OR REPLACE FUNCTION public.generate_pos_display_numbers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_daily_count INTEGER;
  v_queue INTEGER;
  v_display TEXT;
  v_cutoff_hour INTEGER := 6;
  v_business_date DATE;
  v_seed INTEGER;
BEGIN
  -- Calculate business date
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- Count today's orders for this user
  SELECT COUNT(*) + 1 INTO v_daily_count
  FROM public.pos_orders
  WHERE user_id = NEW.user_id
    AND created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
    AND created_at < (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';

  -- Queue number: cycles 1-50
  v_queue := ((v_daily_count - 1) % 50) + 1;

  -- Obfuscated display number: mix day + count with offset to look random
  -- Uses a simple formula: (count * 7 + day_of_year * 3) mod 9000 + 1000 → always 4 digits
  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  v_display := '#' || v_seed::TEXT;

  NEW.display_number := v_display;
  NEW.queue_number := v_queue;
  RETURN NEW;
END;
$function$;

-- Trigger before insert
CREATE TRIGGER trg_pos_display_numbers
BEFORE INSERT ON public.pos_orders
FOR EACH ROW
EXECUTE FUNCTION public.generate_pos_display_numbers();
