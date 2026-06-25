-- Fix POS printed number split-brain:
-- The KDS daily display trigger assigns daily_display_number first.
-- pos_order_before_insert must then reuse that exact value for order_number/queue_number
-- so old and new print bridges print the same visible number on receipt and kitchen tickets.

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
  v_seed INTEGER;
  v_branch UUID;
  v_lock_key BIGINT;
BEGIN
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  SELECT t.branch_id INTO v_branch
  FROM public.pos_sessions s
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE s.id = NEW.session_id;

  v_lock_key := abs(hashtextextended(
    'pos_order_number:' || COALESCE(NEW.company_id::text, NEW.user_id::text, '-') || COALESCE(v_branch::text, '-') || v_business_date::text,
    137
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Preferred path: KDS/daily ticket number was already assigned by
  -- trg_assign_kds_daily_display (alphabetically before this trigger).
  -- Reuse it exactly so receipt, kitchen ticket, KDS, reprint and history agree.
  IF NEW.daily_display_number IS NOT NULL THEN
    v_daily_count := NEW.daily_display_number;
  ELSE
    -- Safe fallback for tenants/branches where KDS daily numbering is disabled.
    SELECT COUNT(*) + 1 INTO v_daily_count
    FROM public.pos_orders po
    LEFT JOIN public.pos_sessions s ON s.id = po.session_id
    LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE po.user_id = NEW.user_id
      AND COALESCE(t.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_branch, '00000000-0000-0000-0000-000000000000'::uuid)
      AND po.created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
      AND po.created_at <  (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';
  END IF;

  NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_daily_count::TEXT, 4, '0');

  -- Store the same visible daily number here too. Older print code may read
  -- queue_number instead of daily_display_number; keeping it identical avoids
  -- receipt/ticket divergence.
  NEW.queue_number := v_daily_count;

  -- Keep the legacy obfuscated display number for screens that still use it.
  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  NEW.display_number := '#' || v_seed::TEXT;

  RETURN NEW;
END;
$$;

-- Remove legacy generators that can assign a different counter on the same insert.
DROP TRIGGER IF EXISTS trg_pos_display_numbers ON public.pos_orders;
DROP TRIGGER IF EXISTS trg_generate_pos_display_numbers ON public.pos_orders;
DROP TRIGGER IF EXISTS trg_pos_order_number ON public.pos_orders;
DROP TRIGGER IF EXISTS trg_generate_pos_order_number ON public.pos_orders;