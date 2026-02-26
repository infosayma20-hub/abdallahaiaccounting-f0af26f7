
-- Sales Representatives (المندوبين)
CREATE TABLE public.sales_representatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  region TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sales_commission_rate NUMERIC NOT NULL DEFAULT 0,
  collection_commission_rate NUMERIC NOT NULL DEFAULT 0,
  linked_account_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_representatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own reps" ON public.sales_representatives FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reps" ON public.sales_representatives FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reps" ON public.sales_representatives FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reps" ON public.sales_representatives FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_sales_reps_updated_at BEFORE UPDATE ON public.sales_representatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Commissions (العمولات)
CREATE TABLE public.commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  representative_id UUID NOT NULL REFERENCES public.sales_representatives(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL CHECK (commission_type IN ('عمولة مبيعات', 'عمولة تحصيل')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('فاتورة', 'سند قبض', 'أخرى')),
  reference_id TEXT,
  reference_description TEXT,
  base_amount NUMERIC NOT NULL DEFAULT 0,
  commission_rate NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  linked_account_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own commissions" ON public.commissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own commissions" ON public.commissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own commissions" ON public.commissions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own commissions" ON public.commissions FOR DELETE USING (auth.uid() = user_id);

-- Orders (الطلبيات) for e-commerce
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_number TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  representative_id UUID REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'جديد' CHECK (status IN ('جديد', 'قيد التجهيز', 'جاهز للشحن', 'تم الشحن', 'تم التسليم', 'مرتجع', 'ملغي')),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  shipping_cost NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'غير مدفوع' CHECK (payment_status IN ('غير مدفوع', 'مدفوع جزئياً', 'مدفوع', 'مسترد')),
  payment_method TEXT DEFAULT 'كاش' CHECK (payment_method IN ('كاش', 'تحويل بنكي', 'شيك', 'دفع إلكتروني', 'آجل')),
  shipping_method TEXT,
  tracking_number TEXT,
  source TEXT DEFAULT 'يدوي' CHECK (source IN ('يدوي', 'متجر إلكتروني', 'واتساب', 'هاتف', 'أخرى')),
  linked_invoice_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own orders" ON public.orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own orders" ON public.orders FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order Items (بنود الطلبية)
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own order items" ON public.order_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own order items" ON public.order_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own order items" ON public.order_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own order items" ON public.order_items FOR DELETE USING (auth.uid() = user_id);

-- Invoice-Receipt Matching (ربط الفواتير بسندات القبض)
CREATE TABLE public.invoice_receipt_matching (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  invoice_amount NUMERIC NOT NULL DEFAULT 0,
  receipt_id TEXT NOT NULL,
  receipt_number TEXT,
  receipt_amount NUMERIC NOT NULL DEFAULT 0,
  matched_amount NUMERIC NOT NULL DEFAULT 0,
  match_date DATE NOT NULL DEFAULT CURRENT_DATE,
  representative_id UUID REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_receipt_matching ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own matching" ON public.invoice_receipt_matching FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own matching" ON public.invoice_receipt_matching FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own matching" ON public.invoice_receipt_matching FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own matching" ON public.invoice_receipt_matching FOR DELETE USING (auth.uid() = user_id);
