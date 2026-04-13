
-- =============================================
-- 1. IDEMPOTENCY KEY UNIQUE CONSTRAINT
-- =============================================

-- Add unique constraint (NULLs are allowed and don't conflict)
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_idempotency_key_unique
UNIQUE (idempotency_key);

-- =============================================
-- 2. FISCAL PERIODS TABLE
-- =============================================

CREATE TABLE public.fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_periods_status_check CHECK (status IN ('open', 'closed', 'locked')),
  CONSTRAINT fiscal_periods_date_range CHECK (end_date >= start_date),
  CONSTRAINT fiscal_periods_user_period_unique UNIQUE (user_id, period_name)
);

-- RLS
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fiscal periods"
  ON public.fiscal_periods FOR SELECT
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can create own fiscal periods"
  ON public.fiscal_periods FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can update own fiscal periods"
  ON public.fiscal_periods FOR UPDATE
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can delete own fiscal periods"
  ON public.fiscal_periods FOR DELETE
  USING (public.is_team_member(auth.uid(), user_id));

-- Index for lookups
CREATE INDEX idx_fiscal_periods_user_dates ON public.fiscal_periods (user_id, start_date, end_date);

-- =============================================
-- 3. VALIDATION TRIGGER ON TRANSACTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.check_fiscal_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period RECORD;
BEGIN
  -- Check if any closed/locked period covers this transaction date
  SELECT id, period_name, status INTO v_period
  FROM public.fiscal_periods
  WHERE user_id = NEW.user_id
    AND NEW.transaction_date >= start_date
    AND NEW.transaction_date <= end_date
    AND status IN ('closed', 'locked')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'الفترة المحاسبية "%" مغلقة. لا يمكن إدخال أو تعديل قيود بتاريخ %',
      v_period.period_name, NEW.transaction_date;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_fiscal_period
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_fiscal_period_open();
