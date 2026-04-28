
-- 1) Add missing columns to official_holidays
ALTER TABLE public.official_holidays
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2) Create hr_day_types table
CREATE TABLE IF NOT EXISTS public.hr_day_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  is_paid boolean NOT NULL DEFAULT true,
  affects_salary boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT false,
  counts_as_attendance boolean NOT NULL DEFAULT true,
  color text NOT NULL DEFAULT '#64748b',
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hr_day_types_user ON public.hr_day_types(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_day_types_active ON public.hr_day_types(user_id, is_active);

-- 3) Enable RLS
ALTER TABLE public.hr_day_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own day types" ON public.hr_day_types;
CREATE POLICY "Users manage their own day types"
  ON public.hr_day_types
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) updated_at trigger
DROP TRIGGER IF EXISTS trg_hr_day_types_updated_at ON public.hr_day_types;
CREATE TRIGGER trg_hr_day_types_updated_at
  BEFORE UPDATE ON public.hr_day_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
