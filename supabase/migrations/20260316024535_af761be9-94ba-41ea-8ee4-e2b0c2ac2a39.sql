
-- Procurement Module Schema

-- Suppliers table
CREATE TABLE public.procurement_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  payment_terms INTEGER DEFAULT 30,
  opening_balance NUMERIC(15,2) DEFAULT 0,
  opening_balance_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Supplier items catalog
CREATE TABLE public.procurement_supplier_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.procurement_suppliers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT DEFAULT 'قطعة',
  default_price NUMERIC(15,2) DEFAULT 0,
  item_code TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase orders
CREATE TABLE public.procurement_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  order_number TEXT,
  supplier_id UUID NOT NULL REFERENCES public.procurement_suppliers(id),
  order_date DATE DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','partially_received','received','cancelled')),
  total_amount NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase order items
CREATE TABLE public.procurement_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  unit TEXT DEFAULT 'قطعة',
  quantity NUMERIC(15,3) DEFAULT 0,
  unit_price NUMERIC(15,2) DEFAULT 0,
  total_price NUMERIC(15,2) DEFAULT 0,
  notes TEXT
);

-- Purchase invoices (procurement module)
CREATE TABLE public.procurement_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  invoice_number TEXT,
  supplier_id UUID NOT NULL REFERENCES public.procurement_suppliers(id),
  purchase_order_id UUID REFERENCES public.procurement_orders(id),
  invoice_date DATE DEFAULT CURRENT_DATE,
  supplier_invoice_number TEXT,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  subtotal NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  tax NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase invoice items
CREATE TABLE public.procurement_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.procurement_invoices(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  unit TEXT DEFAULT 'قطعة',
  ordered_quantity NUMERIC(15,3),
  received_quantity NUMERIC(15,3) DEFAULT 0,
  unit_price NUMERIC(15,2) DEFAULT 0,
  total_price NUMERIC(15,2) DEFAULT 0,
  notes TEXT
);

-- Supplier payments
CREATE TABLE public.procurement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.procurement_suppliers(id),
  invoice_id UUID REFERENCES public.procurement_invoices(id),
  payment_date DATE DEFAULT CURRENT_DATE,
  amount NUMERIC(15,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','bank_transfer','cheque')),
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate PO numbers
CREATE OR REPLACE FUNCTION public.generate_procurement_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.procurement_orders
  WHERE user_id = NEW.user_id
    AND order_date = NEW.order_date;
  NEW.order_number := 'PO-' || TO_CHAR(NEW.order_date, 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gen_procurement_order_number
BEFORE INSERT ON public.procurement_orders
FOR EACH ROW
WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
EXECUTE FUNCTION public.generate_procurement_order_number();

-- Auto-generate Invoice numbers
CREATE OR REPLACE FUNCTION public.generate_procurement_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.procurement_invoices
  WHERE user_id = NEW.user_id
    AND invoice_date = NEW.invoice_date;
  NEW.invoice_number := 'PI-' || TO_CHAR(NEW.invoice_date, 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gen_procurement_invoice_number
BEFORE INSERT ON public.procurement_invoices
FOR EACH ROW
WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
EXECUTE FUNCTION public.generate_procurement_invoice_number();

-- RLS policies
ALTER TABLE public.procurement_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_supplier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_payments ENABLE ROW LEVEL SECURITY;

-- Suppliers RLS
CREATE POLICY "Team members can view suppliers" ON public.procurement_suppliers
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert suppliers" ON public.procurement_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));
CREATE POLICY "Team members can update suppliers" ON public.procurement_suppliers
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can delete suppliers" ON public.procurement_suppliers
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- Supplier items RLS
CREATE POLICY "Team members can view supplier items" ON public.procurement_supplier_items
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert supplier items" ON public.procurement_supplier_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));
CREATE POLICY "Team members can update supplier items" ON public.procurement_supplier_items
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can delete supplier items" ON public.procurement_supplier_items
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- Orders RLS
CREATE POLICY "Team members can view orders" ON public.procurement_orders
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert orders" ON public.procurement_orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));
CREATE POLICY "Team members can update orders" ON public.procurement_orders
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can delete orders" ON public.procurement_orders
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- Order items RLS (via join)
CREATE POLICY "Team members can manage order items" ON public.procurement_order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procurement_orders o WHERE o.id = order_id AND public.is_team_member(auth.uid(), o.user_id)));

-- Invoices RLS
CREATE POLICY "Team members can view invoices" ON public.procurement_invoices
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert invoices" ON public.procurement_invoices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));
CREATE POLICY "Team members can update invoices" ON public.procurement_invoices
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- Invoice items RLS
CREATE POLICY "Team members can manage invoice items" ON public.procurement_invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procurement_invoices i WHERE i.id = invoice_id AND public.is_team_member(auth.uid(), i.user_id)));

-- Payments RLS
CREATE POLICY "Team members can view payments" ON public.procurement_payments
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "Team members can insert payments" ON public.procurement_payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));
CREATE POLICY "Team members can update payments" ON public.procurement_payments
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
