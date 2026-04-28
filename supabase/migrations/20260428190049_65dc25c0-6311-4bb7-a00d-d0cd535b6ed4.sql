-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B2.1: Work Week Config + Day Type Linking
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1) Work Week Config Table
CREATE TABLE IF NOT EXISTS public.hr_work_week_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Day numbers per JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  working_days INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,6]::INTEGER[],   -- Sat→Thu (Friday off)
  weekly_off_days INTEGER[] NOT NULL DEFAULT ARRAY[5]::INTEGER[],          -- Friday
  work_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8.0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_work_week_user ON public.hr_work_week_config(user_id);

ALTER TABLE public.hr_work_week_config ENABLE ROW LEVEL SECURITY;

-- Owner manages, team members read
CREATE POLICY "Owner manages work week"
  ON public.hr_work_week_config
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team members read owner work week"
  ON public.hr_work_week_config
  FOR SELECT
  USING (is_team_member(auth.uid(), user_id));

CREATE TRIGGER trg_hr_work_week_updated_at
  BEFORE UPDATE ON public.hr_work_week_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Link official_holidays -> hr_day_types (optional)
ALTER TABLE public.official_holidays
  ADD COLUMN IF NOT EXISTS day_type_id UUID REFERENCES public.hr_day_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_official_holidays_day_type ON public.official_holidays(day_type_id);

-- 3) Helper function: get_day_type_for_date
CREATE OR REPLACE FUNCTION public.get_day_type_for_date(
  p_user_id UUID,
  p_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow INTEGER;
  v_is_holiday BOOLEAN;
  v_off_days INTEGER[];
BEGIN
  -- Day of week (0=Sun .. 6=Sat) — Postgres EXTRACT(DOW) matches JS getDay()
  v_dow := EXTRACT(DOW FROM p_date)::INTEGER;

  -- 1) Official holiday (date match OR recurring month/day match)
  SELECT EXISTS (
    SELECT 1
    FROM public.official_holidays h
    WHERE h.user_id = p_user_id
      AND h.is_active = TRUE
      AND (
        h.holiday_date = p_date
        OR (
          h.is_recurring = TRUE
          AND h.recurring_month = EXTRACT(MONTH FROM p_date)::INTEGER
          AND h.recurring_day = EXTRACT(DAY FROM p_date)::INTEGER
        )
      )
  ) INTO v_is_holiday;

  IF v_is_holiday THEN
    RETURN 'official_holiday';
  END IF;

  -- 2) Weekly off
  SELECT weekly_off_days INTO v_off_days
  FROM public.hr_work_week_config
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_off_days IS NULL THEN
    v_off_days := ARRAY[5]::INTEGER[];  -- default Friday
  END IF;

  IF v_dow = ANY(v_off_days) THEN
    RETURN 'weekly_off';
  END IF;

  RETURN 'working';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_day_type_for_date(UUID, DATE) TO authenticated;

-- 4) Auto-seed default config on first read (lazy init via UPSERT helper)
CREATE OR REPLACE FUNCTION public.ensure_work_week_config(p_user_id UUID)
RETURNS public.hr_work_week_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.hr_work_week_config;
BEGIN
  INSERT INTO public.hr_work_week_config (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.hr_work_week_config
  WHERE user_id = p_user_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_work_week_config(UUID) TO authenticated;