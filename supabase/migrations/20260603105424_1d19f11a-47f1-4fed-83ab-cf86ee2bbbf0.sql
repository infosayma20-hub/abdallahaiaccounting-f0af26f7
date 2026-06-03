-- Use Asia/Jerusalem so EXTRACT(HOUR ...) matches local wall clock, not UTC.
CREATE OR REPLACE FUNCTION public.pos_business_date(ts timestamptz, cutoff int DEFAULT 6)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN ts IS NULL THEN NULL
    WHEN EXTRACT(HOUR FROM (ts AT TIME ZONE 'Asia/Jerusalem'))::int < COALESCE(cutoff, 6)
      THEN ((ts AT TIME ZONE 'Asia/Jerusalem')::date - 1)
    ELSE (ts AT TIME ZONE 'Asia/Jerusalem')::date
  END;
$$;