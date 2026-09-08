CREATE OR REPLACE FUNCTION public.assign_kds_daily_display_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled BOOLEAN := false;
  v_reset BOOLEAN := true;
  v_start INTEGER := 1;
  v_branch UUID;
  v_business_date DATE;
  v_lock_key BIGINT;
  v_max INTEGER;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
BEGIN
  IF NEW.is_return THEN RETURN NEW; END IF;
  IF NEW.daily_display_number IS NOT NULL THEN RETURN NEW; END IF;

  SELECT pos_kds_enabled, pos_kds_daily_number_reset, pos_kds_daily_number_start
    INTO v_enabled, v_reset, v_start
  FROM public.company_settings
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  v_branch := NEW.branch_id;
  IF v_branch IS NULL AND NEW.session_id IS NOT NULL THEN
    SELECT t.branch_id INTO v_branch
    FROM public.pos_sessions s
    JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE s.id = NEW.session_id;
  END IF;

  v_business_date := public.kds_business_date(COALESCE(NEW.created_at, now()));

  v_lock_key := abs(hashtextextended(
    NEW.company_id::text || COALESCE(v_branch::text,'-') || v_business_date::text,
    42
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_reset THEN
    -- Same business-day window as kds_business_date (06:00 Asia/Hebron cutoff),
    -- expressed as a sargable range so the index is used instead of a full scan.
    v_from := (v_business_date + INTERVAL '6 hours') AT TIME ZONE 'Asia/Hebron';
    v_to   := (v_business_date + INTERVAL '1 day 6 hours') AT TIME ZONE 'Asia/Hebron';

    SELECT COALESCE(MAX(daily_display_number), v_start - 1)
      INTO v_max
    FROM public.pos_orders po
    WHERE po.company_id = NEW.company_id
      AND (
        (v_branch IS NOT NULL AND po.branch_id = v_branch)
        OR (v_branch IS NULL AND po.branch_id IS NULL)
      )
      AND po.created_at >= v_from
      AND po.created_at <  v_to
      AND po.daily_display_number IS NOT NULL;
  ELSE
    SELECT COALESCE(MAX(daily_display_number), v_start - 1)
      INTO v_max
    FROM public.pos_orders
    WHERE company_id = NEW.company_id
      AND daily_display_number IS NOT NULL;
  END IF;

  NEW.daily_display_number := GREATEST(v_max + 1, v_start);
  RETURN NEW;
END;
$function$;