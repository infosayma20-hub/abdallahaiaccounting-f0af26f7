-- Fix POS order-number race condition
-- Root cause: COUNT(*)+1 without a lock allows two concurrent inserts by
-- different cashiers/terminals under the same tenant on the same business
-- date to compute the same next number, producing duplicate order_numbers
-- (e.g. three sessions all issued POS-20260703-0179 on 2026-07-03).
--
-- Surgical fix: serialize numbering with pg_advisory_xact_lock keyed on
-- (user_id, business_date) so concurrent inserts wait for each other's
-- COUNT to commit. Format and semantics (6 AM cutoff, per-tenant counter)
-- are preserved so existing reports and shift grouping keep working.

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
  v_lock_key BIGINT;
BEGIN
  -- Business date: before 6 AM belongs to previous day (Asia/Hebron)
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- CRITICAL FIX: serialize numbering per (user_id, business_date) so
  -- concurrent cashiers on different terminals cannot pick the same seq.
  -- Released automatically at end of the current transaction.
  v_lock_key := hashtextextended(NEW.user_id::text || '|' || v_business_date::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COUNT(*) + 1 INTO v_count
  FROM public.pos_orders
  WHERE user_id = NEW.user_id
    AND created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
    AND created_at < (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';

  NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;