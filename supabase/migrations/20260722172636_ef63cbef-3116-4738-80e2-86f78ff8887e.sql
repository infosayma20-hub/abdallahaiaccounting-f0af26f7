
-- =====================================================================
-- STEP 1: Add unique branch code + branch_id on pos_orders
-- Safe, non-destructive. Historical order_numbers untouched.
-- =====================================================================

-- 1. Add branch_code column to branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS branch_code TEXT;

-- 2. Backfill branch_code per owner (user_id), ordered by created_at → B01, B02...
WITH ranked AS (
  SELECT id,
         'B' || LPAD(ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id)::text, 2, '0') AS code
  FROM public.branches
  WHERE branch_code IS NULL
)
UPDATE public.branches b
SET branch_code = r.code
FROM ranked r
WHERE b.id = r.id;

-- 3. Unique per owner
CREATE UNIQUE INDEX IF NOT EXISTS branches_user_branch_code_key
  ON public.branches(user_id, branch_code)
  WHERE branch_code IS NOT NULL;

-- 4. Auto-assign branch_code for new branches
CREATE OR REPLACE FUNCTION public.assign_branch_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  IF NEW.branch_code IS NULL OR NEW.branch_code = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(branch_code, '\D', '', 'g'), '')::int), 0) + 1
      INTO v_next
    FROM public.branches
    WHERE user_id = NEW.user_id;
    NEW.branch_code := 'B' || LPAD(v_next::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_branch_code ON public.branches;
CREATE TRIGGER trg_assign_branch_code
  BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.assign_branch_code();

-- 5. Add branch_id to pos_orders (denormalized for fast filtering + robust joins)
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- 6. Backfill branch_id from session→terminal→branch
UPDATE public.pos_orders po
SET branch_id = t.branch_id
FROM public.pos_sessions s
JOIN public.pos_terminals t ON t.id = s.terminal_id
WHERE po.session_id = s.id
  AND po.branch_id IS NULL
  AND t.branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_orders_branch_id
  ON public.pos_orders(branch_id) WHERE branch_id IS NOT NULL;

-- 7. Trigger to auto-fill branch_id on insert (BEFORE, before the order_number trigger)
CREATE OR REPLACE FUNCTION public.pos_orders_stamp_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.session_id IS NOT NULL THEN
    SELECT t.branch_id INTO NEW.branch_id
    FROM public.pos_sessions s
    JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE s.id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Name starts with '00_' so it fires before other BEFORE INSERT triggers alphabetically
DROP TRIGGER IF EXISTS trg_00_pos_orders_stamp_branch_id ON public.pos_orders;
CREATE TRIGGER trg_00_pos_orders_stamp_branch_id
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.pos_orders_stamp_branch_id();

-- 8. Update pos_order_before_insert to include branch_code in order_number
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
BEGIN
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- Prefer already-stamped branch_id (from trg_00_pos_orders_stamp_branch_id)
  v_branch := NEW.branch_id;
  IF v_branch IS NULL THEN
    SELECT t.branch_id INTO v_branch
    FROM public.pos_sessions s
    JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE s.id = NEW.session_id;
  END IF;

  SELECT shift_code INTO v_shift_code
  FROM public.pos_sessions WHERE id = NEW.session_id;

  -- Resolve branch code (B01, B02...); NULL if branch not set
  IF v_branch IS NOT NULL THEN
    SELECT branch_code INTO v_branch_code
    FROM public.branches WHERE id = v_branch;
  END IF;

  v_lock_key := abs(hashtextextended(
    'pos_order_number:' || COALESCE(NEW.company_id::text, NEW.user_id::text, '-') || COALESCE(v_branch::text, '-') || v_business_date::text,
    137
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Reuse KDS daily number if already assigned (kept for cross-consistency)
  IF NEW.daily_display_number IS NOT NULL THEN
    v_daily_count := NEW.daily_display_number;
  ELSE
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

  -- New format: POS-YYYYMMDD-{B##}-{S#}-{seq4}
  -- Falls back gracefully if branch_code or shift_code missing (keeps prior behavior)
  IF v_branch_code IS NOT NULL AND v_shift_code IS NOT NULL THEN
    NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_branch_code || '-' || v_shift_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
  ELSIF v_branch_code IS NOT NULL THEN
    NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_branch_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
  ELSIF v_shift_code IS NOT NULL THEN
    NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_shift_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
  ELSE
    NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_daily_count::TEXT, 4, '0');
  END IF;

  NEW.queue_number := v_daily_count;

  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  NEW.display_number := '#' || v_seed::TEXT;

  RETURN NEW;
END;
$function$;

-- 9. UNIQUE INDEX preventing any future duplicate order_number per owner
--    Scoped to new orders only (>= 2026-07-23) so historical duplicates remain untouched.
CREATE UNIQUE INDEX IF NOT EXISTS pos_orders_user_order_number_unique_new
  ON public.pos_orders(user_id, order_number)
  WHERE created_at >= '2026-07-23'::timestamptz;
