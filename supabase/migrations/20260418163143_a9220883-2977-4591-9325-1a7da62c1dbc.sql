
-- جدول دورة يوم البائع
CREATE TABLE public.van_sales_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  day_number TEXT NOT NULL,
  day_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  sales_rep_id UUID NOT NULL REFERENCES public.sales_representatives(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  
  -- الفتح
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID,
  opening_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_currency TEXT NOT NULL DEFAULT 'ILS',
  opening_notes TEXT,
  load_transfer_id UUID REFERENCES public.stock_transfers(id),
  
  -- الإغلاق
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  actual_cash_collected NUMERIC(15,2),
  expected_cash NUMERIC(15,2),
  cash_variance NUMERIC(15,2),
  
  -- ملخص اليوم (يُحدَّث عند الإغلاق)
  total_sales NUMERIC(15,2) DEFAULT 0,
  total_collections NUMERIC(15,2) DEFAULT 0,
  total_invoices INTEGER DEFAULT 0,
  total_returns NUMERIC(15,2) DEFAULT 0,
  
  -- جرد المخزون عند الإغلاق
  stock_variance_value NUMERIC(15,2) DEFAULT 0,
  stock_variance_items INTEGER DEFAULT 0,
  
  closing_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (user_id, day_number)
);

CREATE INDEX idx_van_days_user ON public.van_sales_days(user_id);
CREATE INDEX idx_van_days_rep ON public.van_sales_days(sales_rep_id);
CREATE INDEX idx_van_days_status ON public.van_sales_days(status);
CREATE INDEX idx_van_days_date ON public.van_sales_days(day_date);

-- منع وجود يومين مفتوحين لنفس البائع
CREATE UNIQUE INDEX idx_van_days_one_open_per_rep
  ON public.van_sales_days(sales_rep_id) WHERE status = 'open';

ALTER TABLE public.van_sales_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own van days"
  ON public.van_sales_days FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ترقيم تلقائي VD-YYYY-####
CREATE OR REPLACE FUNCTION public.gen_van_day_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.day_number IS NULL OR NEW.day_number = '' THEN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.van_sales_days
    WHERE user_id = NEW.user_id
      AND day_number LIKE 'VD-' || v_year || '-%';
    NEW.day_number := 'VD-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gen_van_day_number
  BEFORE INSERT ON public.van_sales_days
  FOR EACH ROW EXECUTE FUNCTION public.gen_van_day_number();

CREATE TRIGGER trg_van_days_updated_at
  BEFORE UPDATE ON public.van_sales_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RPC: فتح يوم بائع جديد
-- ============================================
CREATE OR REPLACE FUNCTION public.open_van_day(
  p_sales_rep_id UUID,
  p_opening_cash NUMERIC DEFAULT 0,
  p_opening_currency TEXT DEFAULT 'ILS',
  p_notes TEXT DEFAULT NULL,
  p_load_transfer_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_warehouse_id UUID;
  v_day_id UUID;
  v_existing UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- تحقق: لا يوجد يوم مفتوح لنفس البائع
  SELECT id INTO v_existing
  FROM public.van_sales_days
  WHERE sales_rep_id = p_sales_rep_id AND status = 'open'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'يوجد يوم عمل مفتوح بالفعل لهذا البائع (ID: %)', v_existing;
  END IF;

  -- جلب مستودع البائع الافتراضي
  SELECT default_warehouse_id INTO v_warehouse_id
  FROM public.sales_representatives
  WHERE id = p_sales_rep_id AND user_id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم تعيين مستودع افتراضي لهذا البائع';
  END IF;

  INSERT INTO public.van_sales_days (
    user_id, sales_rep_id, warehouse_id,
    opening_cash, opening_currency, opening_notes,
    opened_by, load_transfer_id, status
  ) VALUES (
    v_user_id, p_sales_rep_id, v_warehouse_id,
    p_opening_cash, p_opening_currency, p_notes,
    v_user_id, p_load_transfer_id, 'open'
  ) RETURNING id INTO v_day_id;

  RETURN v_day_id;
END;
$$;

-- ============================================
-- RPC: إغلاق يوم البائع مع المطابقة
-- ============================================
CREATE OR REPLACE FUNCTION public.close_van_day(
  p_day_id UUID,
  p_actual_cash NUMERIC DEFAULT 0,
  p_closing_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_day RECORD;
  v_total_sales NUMERIC := 0;
  v_total_collections NUMERIC := 0;
  v_total_invoices INTEGER := 0;
  v_expected_cash NUMERIC := 0;
  v_variance NUMERIC := 0;
BEGIN
  SELECT * INTO v_day FROM public.van_sales_days WHERE id = p_day_id AND user_id = v_user_id;
  IF v_day IS NULL THEN
    RAISE EXCEPTION 'Van day not found';
  END IF;
  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'هذا اليوم غير مفتوح (الحالة: %)', v_day.status;
  END IF;

  -- حساب المبيعات من الفواتير المرتبطة بالمستودع منذ فتح اليوم
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_total_sales, v_total_invoices
  FROM public.invoices
  WHERE user_id = v_user_id
    AND warehouse_id = v_day.warehouse_id
    AND created_at >= v_day.opened_at
    AND created_at <= now()
    AND COALESCE(invoice_type, 'sale') IN ('sale','invoice')
    AND COALESCE(is_deleted, false) = false;

  -- حساب التحصيلات النقدية (سندات قبض من البائع خلال الفترة)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_collections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND created_at >= v_day.opened_at
    AND created_at <= now()
    AND transaction_type = 'receipt'
    AND COALESCE(is_deleted, false) = false;

  v_expected_cash := v_day.opening_cash + v_total_collections;
  v_variance := p_actual_cash - v_expected_cash;

  UPDATE public.van_sales_days SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_user_id,
    actual_cash_collected = p_actual_cash,
    expected_cash = v_expected_cash,
    cash_variance = v_variance,
    total_sales = v_total_sales,
    total_collections = v_total_collections,
    total_invoices = v_total_invoices,
    closing_notes = p_closing_notes
  WHERE id = p_day_id;

  RETURN jsonb_build_object(
    'day_id', p_day_id,
    'total_sales', v_total_sales,
    'total_collections', v_total_collections,
    'total_invoices', v_total_invoices,
    'expected_cash', v_expected_cash,
    'actual_cash', p_actual_cash,
    'variance', v_variance
  );
END;
$$;
