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
BEGIN
  IF NEW.is_return THEN RETURN NEW; END IF;
  IF NEW.daily_display_number IS NOT NULL THEN RETURN NEW; END IF;

  SELECT pos_kds_enabled, pos_kds_daily_number_reset, pos_kds_daily_number_start
    INTO v_enabled, v_reset, v_start
  FROM public.company_settings
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  -- Prefer the branch stamped on the order itself; fall back to session/terminal.
  v_branch := NEW.branch_id;
  IF v_branch IS NULL THEN
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
    SELECT COALESCE(MAX(daily_display_number), v_start - 1)
      INTO v_max
    FROM public.pos_orders po
    LEFT JOIN public.pos_sessions s ON s.id = po.session_id
    LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE po.company_id = NEW.company_id
      AND COALESCE(po.branch_id, t.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_branch, '00000000-0000-0000-0000-000000000000'::uuid)
      AND public.kds_business_date(po.created_at) = v_business_date
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

CREATE OR REPLACE FUNCTION public.pos_order_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff_hour INTEGER := 6;
  v_business_date DATE;
  v_daily_count INTEGER;
  v_seed INTEGER;
  v_branch UUID;
  v_branch_code TEXT;
  v_lock_key BIGINT;
  v_shift_code TEXT;
  v_candidate TEXT;
  v_attempts INTEGER := 0;
  v_exists BOOLEAN;
BEGIN
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  v_branch := NEW.branch_id;
  IF v_branch IS NULL THEN
    SELECT t.branch_id INTO v_branch
    FROM public.pos_sessions s
    JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE s.id = NEW.session_id;
  END IF;

  SELECT shift_code INTO v_shift_code
  FROM public.pos_sessions WHERE id = NEW.session_id;

  IF v_branch IS NOT NULL THEN
    SELECT branch_code INTO v_branch_code
    FROM public.branches WHERE id = v_branch;
  END IF;

  v_lock_key := abs(hashtextextended(
    'pos_order_number:' || COALESCE(NEW.company_id::text, NEW.user_id::text, '-') || COALESCE(v_branch::text, '-') || v_business_date::text,
    137
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF NEW.daily_display_number IS NOT NULL THEN
    v_daily_count := NEW.daily_display_number;
  ELSE
    SELECT COALESCE(MAX(po.daily_display_number), 0) + 1
      INTO v_daily_count
    FROM public.pos_orders po
    LEFT JOIN public.pos_sessions s ON s.id = po.session_id
    LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE po.user_id = NEW.user_id
      AND COALESCE(po.branch_id, t.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_branch, '00000000-0000-0000-0000-000000000000'::uuid)
      AND po.created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
      AND po.created_at <  (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';
  END IF;

  LOOP
    IF v_branch_code IS NOT NULL AND v_shift_code IS NOT NULL THEN
      v_candidate := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_branch_code || '-' || v_shift_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
    ELSIF v_branch_code IS NOT NULL THEN
      v_candidate := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_branch_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
    ELSIF v_shift_code IS NOT NULL THEN
      v_candidate := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_shift_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
    ELSE
      v_candidate := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_daily_count::TEXT, 4, '0');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.pos_orders
      WHERE user_id = NEW.user_id
        AND order_number = v_candidate
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;

    v_daily_count := v_daily_count + 1;
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      EXIT;
    END IF;
  END LOOP;

  NEW.order_number := v_candidate;
  NEW.daily_display_number := v_daily_count;
  NEW.queue_number := v_daily_count;

  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  NEW.display_number := '#' || v_seed::TEXT;

  RETURN NEW;
END;
$function$;