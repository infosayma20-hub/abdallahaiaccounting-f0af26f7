-- 1) إضافة حقول الربط على sales_representatives
ALTER TABLE public.sales_representatives
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS username text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_sales_reps_auth_user ON public.sales_representatives(auth_user_id);

-- 2) دوال مساعدة
CREATE OR REPLACE FUNCTION public.get_rep_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.sales_representatives WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_sales_rep()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales_representatives 
    WHERE auth_user_id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_rep_warehouse_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT default_warehouse_id FROM public.sales_representatives WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- 3) منتجات صاحب العمل
DROP POLICY IF EXISTS "Sales rep can view owner products" ON public.products;
CREATE POLICY "Sales rep can view owner products" ON public.products FOR SELECT TO authenticated
USING (public.is_sales_rep() AND user_id = public.get_rep_owner_id());

-- 4) عملاء صاحب العمل
DROP POLICY IF EXISTS "Sales rep can view owner contacts" ON public.contacts;
CREATE POLICY "Sales rep can view owner contacts" ON public.contacts FOR SELECT TO authenticated
USING (public.is_sales_rep() AND user_id = public.get_rep_owner_id());

-- 5) المستودع المخصص للمندوب
DROP POLICY IF EXISTS "Sales rep can view assigned warehouse" ON public.warehouses;
CREATE POLICY "Sales rep can view assigned warehouse" ON public.warehouses FOR SELECT TO authenticated
USING (
  public.is_sales_rep() 
  AND user_id = public.get_rep_owner_id()
  AND id = public.get_rep_warehouse_id()
);

-- 6) profile المندوب نفسه
DROP POLICY IF EXISTS "Sales rep can view own profile" ON public.sales_representatives;
CREATE POLICY "Sales rep can view own profile" ON public.sales_representatives FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

-- 7) أيام عمل المندوب
DROP POLICY IF EXISTS "Sales rep can view own days" ON public.van_sales_days;
CREATE POLICY "Sales rep can view own days" ON public.van_sales_days FOR SELECT TO authenticated
USING (
  public.is_sales_rep() 
  AND sales_rep_id IN (SELECT id FROM public.sales_representatives WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Sales rep can create own day" ON public.van_sales_days;
CREATE POLICY "Sales rep can create own day" ON public.van_sales_days FOR INSERT TO authenticated
WITH CHECK (
  public.is_sales_rep() 
  AND sales_rep_id IN (SELECT id FROM public.sales_representatives WHERE auth_user_id = auth.uid())
  AND user_id = public.get_rep_owner_id()
);

DROP POLICY IF EXISTS "Sales rep can update own day" ON public.van_sales_days;
CREATE POLICY "Sales rep can update own day" ON public.van_sales_days FOR UPDATE TO authenticated
USING (
  public.is_sales_rep() 
  AND sales_rep_id IN (SELECT id FROM public.sales_representatives WHERE auth_user_id = auth.uid())
);

-- 8) فواتير المندوب (محصورة بمستودعه)
DROP POLICY IF EXISTS "Sales rep can create invoices" ON public.invoices;
CREATE POLICY "Sales rep can create invoices" ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  public.is_sales_rep() 
  AND user_id = public.get_rep_owner_id()
  AND warehouse_id = public.get_rep_warehouse_id()
);

DROP POLICY IF EXISTS "Sales rep can view own invoices" ON public.invoices;
CREATE POLICY "Sales rep can view own invoices" ON public.invoices FOR SELECT TO authenticated
USING (
  public.is_sales_rep() 
  AND user_id = public.get_rep_owner_id()
  AND warehouse_id = public.get_rep_warehouse_id()
);

-- 9) بنود الفواتير عبر invoice_id (لا يحتوي user_id)
DROP POLICY IF EXISTS "Sales rep can create invoice items" ON public.invoice_items;
CREATE POLICY "Sales rep can create invoice items" ON public.invoice_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_sales_rep() 
  AND EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
      AND i.user_id = public.get_rep_owner_id()
      AND i.warehouse_id = public.get_rep_warehouse_id()
  )
);

DROP POLICY IF EXISTS "Sales rep can view invoice items" ON public.invoice_items;
CREATE POLICY "Sales rep can view invoice items" ON public.invoice_items FOR SELECT TO authenticated
USING (
  public.is_sales_rep() 
  AND EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
      AND i.user_id = public.get_rep_owner_id()
      AND i.warehouse_id = public.get_rep_warehouse_id()
  )
);