
-- Phase 1: Persistent close snapshot table (additive, non-breaking)
CREATE TABLE IF NOT EXISTS public.pos_shift_close_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
  company_id uuid,
  branch_id uuid,
  cashier_pos_user_id uuid,
  cashier_name text,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by_auth_user_id uuid,
  business_date date,
  shift_code text,
  -- Headline totals (as printed on the closing receipt)
  total_sales numeric NOT NULL DEFAULT 0,
  total_returns numeric NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  cash_variance numeric NOT NULL DEFAULT 0,
  -- Payment method breakdown in ILS
  cash_ils numeric NOT NULL DEFAULT 0,
  visa_ils numeric NOT NULL DEFAULT 0,
  credit_ils numeric NOT NULL DEFAULT 0,
  other_ils numeric NOT NULL DEFAULT 0,
  -- Foreign currency tenders aggregated
  fx_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Adjustments captured at closure
  cash_transfers_total numeric NOT NULL DEFAULT 0,
  expenses_total numeric NOT NULL DEFAULT 0,
  -- Raw fingerprint of inputs at snapshot moment (for later diffing)
  raw_payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_cash_transfers jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_expenses jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Full receipt payload (what was printed)
  receipt_payload jsonb,
  -- Provenance
  source text NOT NULL DEFAULT 'closure' CHECK (source IN ('closure','backfill','manual')),
  version integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_shift_close_snapshots_session_unique UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_pscs_company_closed_at ON public.pos_shift_close_snapshots(company_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pscs_branch_business_date ON public.pos_shift_close_snapshots(branch_id, business_date);
CREATE INDEX IF NOT EXISTS idx_pscs_cashier ON public.pos_shift_close_snapshots(cashier_pos_user_id);

GRANT SELECT ON public.pos_shift_close_snapshots TO authenticated;
GRANT ALL ON public.pos_shift_close_snapshots TO service_role;

ALTER TABLE public.pos_shift_close_snapshots ENABLE ROW LEVEL SECURITY;

-- Read policy: same tenant as the underlying session
CREATE POLICY "snapshots_select_same_company"
ON public.pos_shift_close_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pos_sessions s
    WHERE s.id = pos_shift_close_snapshots.session_id
      AND (
        s.company_id IS NULL
        OR s.company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      )
  )
);

-- No direct INSERT/UPDATE/DELETE from clients — writes only via SECURITY DEFINER functions.

-- Post-close edits audit trail (populated by later phases; created now to reserve schema)
CREATE TABLE IF NOT EXISTS public.pos_shift_post_close_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
  entity_table text NOT NULL,       -- 'pos_orders' | 'pos_payments' | ...
  entity_id uuid NOT NULL,
  action text NOT NULL,             -- 'update' | 'delete' | 'insert'
  before_data jsonb,
  after_data jsonb,
  reason text,
  performed_by_auth_user_id uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pspce_session ON public.pos_shift_post_close_edits(session_id, performed_at DESC);

GRANT SELECT ON public.pos_shift_post_close_edits TO authenticated;
GRANT ALL ON public.pos_shift_post_close_edits TO service_role;

ALTER TABLE public.pos_shift_post_close_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_close_edits_select_same_company"
ON public.pos_shift_post_close_edits
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pos_sessions s
    WHERE s.id = pos_shift_post_close_edits.session_id
      AND (
        s.company_id IS NULL
        OR s.company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      )
  )
);

-- updated_at trigger for snapshots (only touched by definer functions, but safe to have)
CREATE OR REPLACE FUNCTION public.pscs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pscs_touch_updated_at ON public.pos_shift_close_snapshots;
CREATE TRIGGER trg_pscs_touch_updated_at
BEFORE UPDATE ON public.pos_shift_close_snapshots
FOR EACH ROW EXECUTE FUNCTION public.pscs_touch_updated_at();
