
-- Import Shipments
CREATE TABLE public.import_shipments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  shipment_number TEXT UNIQUE NOT NULL,
  shipment_name TEXT,
  supplier_id UUID REFERENCES public.contacts(id),
  supplier_invoice_number TEXT,
  invoice_date DATE,
  currency_id UUID REFERENCES public.currencies(id),
  exchange_rate DECIMAL(10,4),
  status TEXT DEFAULT 'draft' NOT NULL,
  total_items_cost_foreign DECIMAL(15,2) DEFAULT 0,
  total_items_cost_local DECIMAL(15,2) DEFAULT 0,
  total_import_costs DECIMAL(15,2) DEFAULT 0,
  total_landed_cost DECIMAL(15,2) DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  posted_at TIMESTAMPTZ,
  notes TEXT
);

-- Import Shipment Items
CREATE TABLE public.import_shipment_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.import_shipments(id) ON DELETE CASCADE,
  line_number INTEGER,
  item_image_url TEXT,
  model_code TEXT,
  description_en TEXT,
  description_ar TEXT,
  color TEXT,
  size_mm TEXT,
  unit_price_foreign DECIMAL(15,2),
  quantity INTEGER DEFAULT 1,
  cbm_per_unit DECIMAL(10,4),
  total_cbm DECIMAL(10,4),
  total_price_foreign DECIMAL(15,2),
  total_price_local DECIMAL(15,2),
  allocated_shipping DECIMAL(15,2) DEFAULT 0,
  allocated_customs DECIMAL(15,2) DEFAULT 0,
  allocated_other_costs DECIMAL(15,2) DEFAULT 0,
  total_allocated_costs DECIMAL(15,2) DEFAULT 0,
  landed_cost_total DECIMAL(15,2),
  landed_cost_per_unit DECIMAL(15,2),
  product_id UUID REFERENCES public.products(id)
);

-- Import Costs
CREATE TABLE public.import_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.import_shipments(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL,
  cost_name_ar TEXT NOT NULL,
  amount DECIMAL(15,2),
  currency_id UUID REFERENCES public.currencies(id),
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  amount_local DECIMAL(15,2),
  account_code TEXT,
  supplier_id UUID REFERENCES public.contacts(id),
  distribution_method TEXT DEFAULT 'cbm',
  notes TEXT,
  receipt_url TEXT
);

-- Cost Distribution Log
CREATE TABLE public.import_cost_distribution (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.import_shipments(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.import_shipment_items(id) ON DELETE CASCADE,
  cost_id UUID REFERENCES public.import_costs(id) ON DELETE CASCADE,
  allocated_amount DECIMAL(15,2),
  allocation_basis DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate shipment number
CREATE OR REPLACE FUNCTION public.generate_import_shipment_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.import_shipments
  WHERE user_id = NEW.user_id;
  NEW.shipment_number := 'IMP-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_import_shipment_number
  BEFORE INSERT ON public.import_shipments
  FOR EACH ROW
  WHEN (NEW.shipment_number IS NULL OR NEW.shipment_number = '')
  EXECUTE FUNCTION public.generate_import_shipment_number();

-- RLS
ALTER TABLE public.import_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_cost_distribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import shipments" ON public.import_shipments
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own import items" ON public.import_shipment_items
  FOR ALL TO authenticated
  USING (shipment_id IN (SELECT id FROM public.import_shipments WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)))
  WITH CHECK (shipment_id IN (SELECT id FROM public.import_shipments WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own import costs" ON public.import_costs
  FOR ALL TO authenticated
  USING (shipment_id IN (SELECT id FROM public.import_shipments WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)))
  WITH CHECK (shipment_id IN (SELECT id FROM public.import_shipments WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own cost distribution" ON public.import_cost_distribution
  FOR ALL TO authenticated
  USING (shipment_id IN (SELECT id FROM public.import_shipments WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)))
  WITH CHECK (shipment_id IN (SELECT id FROM public.import_shipments WHERE user_id = auth.uid()));
