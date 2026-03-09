
-- Create invoices table for sales invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  invoice_number TEXT,
  invoice_type TEXT NOT NULL DEFAULT 'sale',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  remaining_amount NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'paid',
  payment_method TEXT DEFAULT 'نقدي',
  currency TEXT DEFAULT 'شيكل',
  notes TEXT,
  linked_transaction_id UUID,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoice_items table
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID,
  product_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices
CREATE POLICY "Users can view own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can insert own invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can delete own invoices" ON public.invoices
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS policies for invoice_items
CREATE POLICY "Users can view own invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)));

CREATE POLICY "Users can insert own invoice items" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own invoice items" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)));

CREATE POLICY "Users can delete own invoice items" ON public.invoice_items
  FOR DELETE TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid()));

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_prefix TEXT;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number != '' THEN
    RETURN NEW;
  END IF;
  
  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    ELSE 'DOC'
  END;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.invoices
  WHERE user_id = NEW.user_id AND invoice_type = NEW.invoice_type;
  
  NEW.invoice_number := v_prefix || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_invoice_number();
