
-- =============================================
-- Fixed Assets Management System — Full Schema
-- =============================================

-- 1. Asset Categories
CREATE TABLE public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  name_ar text NOT NULL,
  parent_id uuid REFERENCES public.asset_categories(id),
  default_useful_life_years int,
  default_depreciation_method text DEFAULT 'straight_line',
  default_salvage_rate numeric(5,2) DEFAULT 0,
  asset_account_code text,
  depreciation_expense_account_code text,
  accumulated_depreciation_account_code text,
  gain_loss_account_code text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, code)
);

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories" ON public.asset_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.asset_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.asset_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON public.asset_categories FOR DELETE USING (auth.uid() = user_id);

-- 2. Assets (Main Register)
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_number text NOT NULL,
  barcode text,
  name_ar text NOT NULL,
  description text,
  category_id uuid REFERENCES public.asset_categories(id),
  branch_id uuid REFERENCES public.branches(id),
  department text,
  location text,
  custodian_name text,
  custodian_id uuid REFERENCES public.employees(id),
  supplier_name text,
  purchase_order_number text,
  invoice_number text,
  acquisition_date date NOT NULL,
  in_service_date date,
  acquisition_cost numeric(18,2) NOT NULL DEFAULT 0,
  additional_costs numeric(18,2) DEFAULT 0,
  total_cost numeric(18,2) GENERATED ALWAYS AS (acquisition_cost + additional_costs) STORED,
  currency_id uuid REFERENCES public.currencies(id),
  exchange_rate numeric(18,6) DEFAULT 1,
  cost_ils numeric(18,2),
  salvage_value numeric(18,2) DEFAULT 0,
  useful_life_years int,
  useful_life_months int,
  depreciation_method text NOT NULL DEFAULT 'straight_line',
  declining_balance_rate numeric(5,2),
  total_units int,
  depreciation_start_date date,
  accumulated_depreciation numeric(18,2) DEFAULT 0,
  net_book_value numeric(18,2) DEFAULT 0,
  last_depreciation_date date,
  status text NOT NULL DEFAULT 'active',
  disposal_date date,
  disposal_amount numeric(18,2),
  disposal_method text,
  warranty_expiry_date date,
  insurance_policy text,
  insurance_expiry_date date,
  serial_number text,
  model text,
  manufacturer text,
  image_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, asset_number)
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assets" ON public.assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assets" ON public.assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assets" ON public.assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assets" ON public.assets FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

-- 3. Depreciation Entries
CREATE TABLE public.asset_depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  depreciation_amount numeric(18,2) NOT NULL DEFAULT 0,
  accumulated_total numeric(18,2) NOT NULL DEFAULT 0,
  net_book_value numeric(18,2) NOT NULL DEFAULT 0,
  method_used text,
  status text DEFAULT 'posted',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.asset_depreciation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dep entries" ON public.asset_depreciation_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own dep entries" ON public.asset_depreciation_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own dep entries" ON public.asset_depreciation_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own dep entries" ON public.asset_depreciation_entries FOR DELETE USING (auth.uid() = user_id AND status != 'posted');

-- 4. Asset Disposals
CREATE TABLE public.asset_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  disposal_date date NOT NULL,
  disposal_number text,
  disposal_method text NOT NULL,
  net_book_value_at_disposal numeric(18,2) DEFAULT 0,
  disposal_proceeds numeric(18,2) DEFAULT 0,
  gain_loss numeric(18,2) DEFAULT 0,
  buyer_name text,
  buyer_details text,
  reason text,
  approved_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.asset_disposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disposals" ON public.asset_disposals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own disposals" ON public.asset_disposals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own disposals" ON public.asset_disposals FOR UPDATE USING (auth.uid() = user_id);

-- 5. Asset Transfers
CREATE TABLE public.asset_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  transfer_date date NOT NULL,
  transfer_number text,
  from_branch text,
  to_branch text,
  from_department text,
  to_department text,
  from_custodian text,
  to_custodian text,
  reason text,
  approved_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.asset_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transfers" ON public.asset_transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transfers" ON public.asset_transfers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Asset Maintenance
CREATE TABLE public.asset_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  maintenance_date date NOT NULL,
  maintenance_number text,
  type text NOT NULL DEFAULT 'corrective',
  description text,
  cost numeric(18,2) DEFAULT 0,
  capitalize boolean DEFAULT false,
  vendor_name text,
  warranty_covered boolean DEFAULT false,
  next_maintenance_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own maintenance" ON public.asset_maintenance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own maintenance" ON public.asset_maintenance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own maintenance" ON public.asset_maintenance FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own maintenance" ON public.asset_maintenance FOR DELETE USING (auth.uid() = user_id);

-- 7. Asset Revaluations
CREATE TABLE public.asset_revaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  revaluation_date date NOT NULL,
  old_cost numeric(18,2),
  new_cost numeric(18,2),
  old_accumulated_depreciation numeric(18,2),
  new_accumulated_depreciation numeric(18,2),
  old_net_book_value numeric(18,2),
  new_net_book_value numeric(18,2),
  revaluation_surplus_or_deficit numeric(18,2),
  reason text,
  appraiser_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.asset_revaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own revaluations" ON public.asset_revaluations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own revaluations" ON public.asset_revaluations FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_asset_categories_updated_at BEFORE UPDATE ON public.asset_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
