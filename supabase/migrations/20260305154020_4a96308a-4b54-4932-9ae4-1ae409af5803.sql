
-- 1. Suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  payment_terms TEXT DEFAULT 'cash',
  credit_limit DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- 2. Purchase invoices
CREATE TABLE public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT,
  user_id UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name TEXT,
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  reference_no TEXT,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 16,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','credit','transfer','check')),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  remaining_amount DECIMAL(12,2) DEFAULT 0,
  invoice_image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','posted')),
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  linked_transaction_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own purchase invoices" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- 3. Purchase invoice items
CREATE TABLE public.purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  unit TEXT DEFAULT 'قطعة',
  quantity DECIMAL(10,3) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  tax_pct DECIMAL(5,2) DEFAULT 16,
  total_amount DECIMAL(12,2) NOT NULL,
  previous_price DECIMAL(10,2),
  price_change_pct DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own purchase invoice items" ON public.purchase_invoice_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi 
      WHERE pi.id = invoice_id 
      AND public.is_team_member(auth.uid(), pi.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi 
      WHERE pi.id = invoice_id 
      AND public.is_team_member(auth.uid(), pi.user_id)
    )
  );

-- 4. Auto-generate invoice number
CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.purchase_invoices
  WHERE user_id = NEW.user_id;
  
  NEW.invoice_number := 'PO-' || to_char(now(), 'YYYY') || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER before_insert_purchase_invoice
  BEFORE INSERT ON public.purchase_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_purchase_invoice_number();

-- 5. Storage bucket for invoice images
INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-invoices', 'purchase-invoices', true);

CREATE POLICY "Auth users can upload purchase invoices" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'purchase-invoices');

CREATE POLICY "Anyone can view purchase invoices" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'purchase-invoices');

CREATE POLICY "Auth users can delete own purchase invoices" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'purchase-invoices');
