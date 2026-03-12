
-- Suppliers table
CREATE TABLE public.pos_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can read suppliers" ON public.pos_suppliers FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert suppliers" ON public.pos_suppliers FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Purchases table
CREATE TABLE public.pos_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  supplier_id UUID REFERENCES public.pos_suppliers(id),
  product_id UUID REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  shift_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can read purchases" ON public.pos_purchases FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert purchases" ON public.pos_purchases FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Expense categories table
CREATE TABLE public.pos_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'operational',
  account_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can read expense categories" ON public.pos_expense_categories FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert expense categories" ON public.pos_expense_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Expenses table
CREATE TABLE public.pos_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category_id UUID REFERENCES public.pos_expense_categories(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  shift_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can read expenses" ON public.pos_expenses FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert expenses" ON public.pos_expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Inventory movements table
CREATE TABLE public.pos_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'production_in',
  notes TEXT,
  shift_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can read inventory movements" ON public.pos_inventory_movements FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert inventory movements" ON public.pos_inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Add new permission columns to pos_user_permissions
ALTER TABLE public.pos_user_permissions
  ADD COLUMN IF NOT EXISTS can_add_inventory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_product BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_record_purchases BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pay_purchases_cash BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_supplier BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_affect_inventory_on_purchase BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_record_expenses BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_expense_category BOOLEAN NOT NULL DEFAULT false;
