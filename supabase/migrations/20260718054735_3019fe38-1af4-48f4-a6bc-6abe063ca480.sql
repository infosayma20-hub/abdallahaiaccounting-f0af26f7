-- ============================================================
-- Shift Code in POS Order Number
-- Adds S1/S2/S3 identifier per branch per day, embedded in order_number
-- ============================================================

-- 1) Add columns to pos_sessions (nullable so existing rows stay valid)
ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS shift_seq INT,
  ADD COLUMN IF NOT EXISTS shift_code TEXT,
  ADD COLUMN IF NOT EXISTS business_date DATE,
  ADD COLUMN IF NOT EXISTS branch_id UUID;

-- 2) Trigger function: assigns shift_seq / shift_code / business_date / branch_id
CREATE OR REPLACE FUNCTION public.assign_pos_shift_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff_hour INTEGER := 6;
  v_business_date DATE;
  v_branch UUID;
  v_next INT;
  v_lock_key BIGINT;
BEGIN
  -- Skip if already assigned (idempotent — safe for backfill / manual sets)
  IF NEW.shift_seq IS NOT NULL AND NEW.shift_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Business date matches pos_order_before_insert cutoff logic
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- Resolve branch from terminal (denormalized snapshot for fast unique constraint)
  IF NEW.terminal_id IS NOT NULL THEN
    SELECT t.branch_id INTO v_branch
    FROM public.pos_terminals t
    WHERE t.id = NEW.terminal_id;
  END IF;

  NEW.business_date := COALESCE(NEW.business_date, v_business_date);
  NEW.branch_id := COALESCE(NEW.branch_id, v_branch);

  -- Serialize concurrent session opens on same branch/day
  v_lock_key := abs(hashtextextended(
    'pos_shift_code:' || COALESCE(NEW.branch_id::text, '-') || ':' || NEW.business_date::text,
    241
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(shift_seq), 0) + 1
    INTO v_next
  FROM public.pos_sessions
  WHERE COALESCE(branch_id::text, '-') = COALESCE(NEW.branch_id::text, '-')
    AND business_date = NEW.business_date;

  NEW.shift_seq := v_next;
  NEW.shift_code := 'S' || v_next::text;

  RETURN NEW;
END;
$function$;

-- 3) Trigger on pos_sessions BEFORE INSERT
DROP TRIGGER IF EXISTS trg_assign_pos_shift_code ON public.pos_sessions;
CREATE TRIGGER trg_assign_pos_shift_code
  BEFORE INSERT ON public.pos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_pos_shift_code();

-- 4) Unique index — only enforced when all three are present (post-migration rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sessions_branch_date_seq_unique
  ON public.pos_sessions (branch_id, business_date, shift_seq)
  WHERE branch_id IS NOT NULL AND business_date IS NOT NULL AND shift_seq IS NOT NULL;

-- 5) Helpful lookup index
CREATE INDEX IF NOT EXISTS idx_pos_sessions_shift_code
  ON public.pos_sessions (branch_id, business_date, shift_code)
  WHERE shift_code IS NOT NULL;

-- 6) Backfill OPEN sessions only (closed sessions stay untouched — historical accuracy)
--    Uses the same cutoff logic to derive business_date from opened_at.
DO $$
DECLARE
  r RECORD;
  v_business_date DATE;
  v_branch UUID;
  v_next INT;
BEGIN
  FOR r IN
    SELECT s.id, s.opened_at, s.terminal_id
    FROM public.pos_sessions s
    WHERE s.state = 'open'
      AND s.shift_seq IS NULL
    ORDER BY s.opened_at ASC
  LOOP
    -- Derive business_date from opened_at
    IF EXTRACT(HOUR FROM r.opened_at AT TIME ZONE 'Asia/Hebron') < 6 THEN
      v_business_date := (r.opened_at AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
    ELSE
      v_business_date := (r.opened_at AT TIME ZONE 'Asia/Hebron')::date;
    END IF;

    SELECT t.branch_id INTO v_branch
    FROM public.pos_terminals t
    WHERE t.id = r.terminal_id;

    SELECT COALESCE(MAX(shift_seq), 0) + 1
      INTO v_next
    FROM public.pos_sessions
    WHERE COALESCE(branch_id::text, '-') = COALESCE(v_branch::text, '-')
      AND business_date = v_business_date;

    UPDATE public.pos_sessions
       SET business_date = v_business_date,
           branch_id = v_branch,
           shift_seq = v_next,
           shift_code = 'S' || v_next::text
     WHERE id = r.id;
  END LOOP;
END $$;

-- 7) Extend pos_order_before_insert to include shift_code in the number
--    All existing logic preserved verbatim. Only order_number formatting changes.
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
  v_lock_key BIGINT;
  v_shift_code TEXT;
BEGIN
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  SELECT t.branch_id, s.shift_code
    INTO v_branch, v_shift_code
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

  -- New format with shift code (only if session has one); fallback to old format
  IF v_shift_code IS NOT NULL THEN
    NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || v_shift_code || '-' || LPAD(v_daily_count::TEXT, 4, '0');
  ELSE
    NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_daily_count::TEXT, 4, '0');
  END IF;

  -- Store the same visible daily number here too. Older print code may read
  -- queue_number instead of daily_display_number; keeping it identical avoids
  -- receipt/ticket divergence.
  NEW.queue_number := v_daily_count;

  -- Keep the legacy obfuscated display number for screens that still use it.
  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  NEW.display_number := '#' || v_seed::TEXT;

  RETURN NEW;
END;
$function$;