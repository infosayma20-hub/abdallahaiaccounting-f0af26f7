
-- ============================================================================
-- Phase 1: Structural Foundation — Financial Dimensions & Cost Centers
-- Additive only — no impact on existing transactions/reports
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COST CENTERS (master table for structured cost centers)
-- ----------------------------------------------------------------------------
CREATE TABLE public.cost_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  parent_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  center_type TEXT NOT NULL DEFAULT 'operational',
    -- operational | administrative | project | sales | support
  gl_account_code TEXT,
    -- optional link to a Chart of Accounts entry
  manager_employee_id UUID,
  branch_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cost_centers_code_unique_per_user UNIQUE (user_id, code)
);

CREATE INDEX idx_cost_centers_user ON public.cost_centers(user_id) WHERE is_deleted = false;
CREATE INDEX idx_cost_centers_parent ON public.cost_centers(parent_id);
CREATE INDEX idx_cost_centers_type ON public.cost_centers(user_id, center_type) WHERE is_deleted = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cost centers"
  ON public.cost_centers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own cost centers"
  ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own cost centers"
  ON public.cost_centers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own cost centers"
  ON public.cost_centers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. FINANCIAL DIMENSIONS (dimension type definitions)
-- ----------------------------------------------------------------------------
CREATE TABLE public.financial_dimensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  source_table TEXT,
    -- NULL=custom values; otherwise one of:
    -- branches | departments | cost_centers | workshops | employees |
    -- contacts | sales_reps | accounts
  is_required BOOLEAN NOT NULL DEFAULT false,
    -- when true, journal entries should populate this dimension (UI hint;
    -- not enforced at DB level in Phase 1 to avoid breaking existing posts)
  is_system BOOLEAN NOT NULL DEFAULT false,
    -- system-seeded dimensions cannot be deleted
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_dimensions_code_unique_per_user UNIQUE (user_id, code)
);

CREATE INDEX idx_financial_dimensions_user ON public.financial_dimensions(user_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_dimensions TO authenticated;
GRANT ALL ON public.financial_dimensions TO service_role;

ALTER TABLE public.financial_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own financial dimensions"
  ON public.financial_dimensions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own financial dimensions"
  ON public.financial_dimensions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own financial dimensions"
  ON public.financial_dimensions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own financial dimensions"
  ON public.financial_dimensions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND is_system = false);

-- ----------------------------------------------------------------------------
-- 3. FINANCIAL DIMENSION VALUES (values for CUSTOM dimensions only)
-- ----------------------------------------------------------------------------
CREATE TABLE public.financial_dimension_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dimension_id UUID NOT NULL REFERENCES public.financial_dimensions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  parent_id UUID REFERENCES public.financial_dimension_values(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fdv_code_unique_per_dimension UNIQUE (dimension_id, code)
);

CREATE INDEX idx_fdv_dimension ON public.financial_dimension_values(dimension_id) WHERE is_active = true;
CREATE INDEX idx_fdv_user ON public.financial_dimension_values(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_dimension_values TO authenticated;
GRANT ALL ON public.financial_dimension_values TO service_role;

ALTER TABLE public.financial_dimension_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dimension values"
  ON public.financial_dimension_values FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own dimension values"
  ON public.financial_dimension_values FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own dimension values"
  ON public.financial_dimension_values FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own dimension values"
  ON public.financial_dimension_values FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. TRANSACTION DIMENSIONS (link table - additive, never modifies transactions)
-- ----------------------------------------------------------------------------
CREATE TABLE public.transaction_dimensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
    -- soft FK to public.transactions(id); no hard FK to keep this layer
    -- decoupled (transactions has cascade/soft-delete machinery already)
  dimension_id UUID NOT NULL REFERENCES public.financial_dimensions(id) ON DELETE CASCADE,
  -- exactly one of the following will be populated based on dimension.source_table:
  value_id UUID,           -- when source_table = financial_dimension_values (custom)
  value_ref_id UUID,       -- when source_table points to a real master table (branches, etc.)
  value_text TEXT,         -- free-text fallback
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT td_one_value_required CHECK (
    value_id IS NOT NULL OR value_ref_id IS NOT NULL OR value_text IS NOT NULL
  ),
  CONSTRAINT td_unique_per_transaction_dimension UNIQUE (transaction_id, dimension_id)
);

CREATE INDEX idx_td_transaction ON public.transaction_dimensions(transaction_id);
CREATE INDEX idx_td_dimension ON public.transaction_dimensions(dimension_id);
CREATE INDEX idx_td_user ON public.transaction_dimensions(user_id);
CREATE INDEX idx_td_value_ref ON public.transaction_dimensions(value_ref_id) WHERE value_ref_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_dimensions TO authenticated;
GRANT ALL ON public.transaction_dimensions TO service_role;

ALTER TABLE public.transaction_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transaction dimensions"
  ON public.transaction_dimensions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own transaction dimensions"
  ON public.transaction_dimensions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own transaction dimensions"
  ON public.transaction_dimensions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own transaction dimensions"
  ON public.transaction_dimensions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. updated_at triggers (reuse existing function)
-- ----------------------------------------------------------------------------
CREATE TRIGGER trg_cost_centers_updated_at
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_financial_dimensions_updated_at
  BEFORE UPDATE ON public.financial_dimensions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_financial_dimension_values_updated_at
  BEFORE UPDATE ON public.financial_dimension_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. Helper function: seed default dimensions for a user (callable from UI later)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_financial_dimensions(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_dimensions (user_id, code, name, name_ar, source_table, is_system, display_order)
  VALUES
    (p_user_id, 'BRANCH',      'Branch',          'الفرع',         'branches',      true, 10),
    (p_user_id, 'DEPARTMENT',  'Department',      'القسم',         'departments',   true, 20),
    (p_user_id, 'COST_CENTER', 'Cost Center',     'مركز التكلفة',  'cost_centers',  true, 30),
    (p_user_id, 'WORKSHOP',    'Workshop/Project','ورشة/مشروع',   'workshops',     true, 40),
    (p_user_id, 'EMPLOYEE',    'Employee',        'الموظف',        'employees',     true, 50),
    (p_user_id, 'SALES_REP',   'Sales Rep',       'المندوب',       'contacts',      true, 60)
  ON CONFLICT (user_id, code) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_financial_dimensions(UUID) TO authenticated;
