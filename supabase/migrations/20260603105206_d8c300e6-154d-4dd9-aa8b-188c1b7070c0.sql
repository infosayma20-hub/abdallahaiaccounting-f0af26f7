-- Centralized POS business-date helper
CREATE OR REPLACE FUNCTION public.pos_business_date(ts timestamptz, cutoff int DEFAULT 6)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN ts IS NULL THEN NULL
    WHEN EXTRACT(HOUR FROM ts)::int < COALESCE(cutoff, 6)
      THEN (ts::date - 1)
    ELSE ts::date
  END;
$$;

COMMENT ON FUNCTION public.pos_business_date(timestamptz, int) IS
'Returns the POS accounting business date for a given timestamp. Sales between 00:00 and (cutoff-1):59:59 belong to the previous business day. Default cutoff = 6 AM.';

-- business_date column on pos_orders (idempotent)
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS business_date date;

CREATE INDEX IF NOT EXISTS idx_pos_orders_user_business_date
  ON public.pos_orders(user_id, business_date);

-- Trigger to auto-populate business_date from paid_at / created_at
CREATE OR REPLACE FUNCTION public._pos_orders_set_business_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff int;
  v_ts timestamptz;
BEGIN
  SELECT COALESCE(pos_day_cutoff_hour, 6) INTO v_cutoff
  FROM public.company_settings
  WHERE user_id = NEW.user_id
  LIMIT 1;
  v_cutoff := COALESCE(v_cutoff, 6);

  v_ts := COALESCE(NEW.paid_at, NEW.created_at, now());
  NEW.business_date := public.pos_business_date(v_ts, v_cutoff);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_set_business_date ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_set_business_date
BEFORE INSERT OR UPDATE OF paid_at, created_at, user_id
ON public.pos_orders
FOR EACH ROW
EXECUTE FUNCTION public._pos_orders_set_business_date();