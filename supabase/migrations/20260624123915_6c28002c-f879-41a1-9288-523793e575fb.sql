-- Align POS order_number suffix with daily_display_number by counting per BRANCH
-- instead of per user (company-wide). This guarantees that:
--   • Customer receipt "رقم الطلب" (daily_display_number, branch-scoped)
--   • Kitchen / heater ticket fallback (last segment of order_number)
-- always show the SAME number for the same order, regardless of which
-- print-bridge version is installed at the branch.

CREATE OR REPLACE FUNCTION public.pos_order_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff_hour INTEGER := 6;
  v_business_date DATE;
  v_daily_count INTEGER;
  v_queue INTEGER;
  v_seed INTEGER;
  v_branch UUID;
  v_lock_key BIGINT;
BEGIN
  -- Business date (6 AM cutoff, Asia/Hebron)
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- Resolve branch via terminal (pos_sessions has no branch_id) — same path
  -- used by assign_kds_daily_display_number so both numbers line up.
  SELECT t.branch_id INTO v_branch
  FROM public.pos_sessions s
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE s.id = NEW.session_id;

  -- Serialize per (company, branch, business_date) to avoid duplicate suffixes
  -- under concurrent inserts. Matches the lock key shape used by the KDS trigger.
  v_lock_key := abs(hashtextextended(
    'pos_order_number:' || NEW.user_id::text || COALESCE(v_branch::text, '-') || v_business_date::text,
    137
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Per-branch daily count (was: per user_id / company-wide).
  SELECT COUNT(*) + 1 INTO v_daily_count
  FROM public.pos_orders po
  LEFT JOIN public.pos_sessions s ON s.id = po.session_id
  LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE po.user_id = NEW.user_id
    AND COALESCE(t.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_branch, '00000000-0000-0000-0000-000000000000'::uuid)
    AND po.created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
    AND po.created_at <  (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';

  NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_daily_count::TEXT, 4, '0');

  -- Keep queue_number / display_number derivations unchanged in shape, but
  -- they are now also branch-scoped because v_daily_count is branch-scoped.
  v_queue := ((v_daily_count - 1) % 50) + 1;
  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  NEW.display_number := '#' || v_seed::TEXT;
  NEW.queue_number := v_queue;

  RETURN NEW;
END;
$$;