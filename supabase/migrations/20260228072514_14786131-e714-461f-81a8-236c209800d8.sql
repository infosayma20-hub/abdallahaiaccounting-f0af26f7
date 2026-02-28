
-- =============================================
-- POS SYSTEM DATABASE SCHEMA - Phase 1
-- =============================================

-- 1. Companies table (Multi-company support)
CREATE TABLE public.pos_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  vat_number TEXT,
  currency_code TEXT NOT NULL DEFAULT 'ILS',
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own companies" ON public.pos_companies FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_pos_companies_updated_at BEFORE UPDATE ON public.pos_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. POS Terminals / Config per branch
CREATE TABLE public.pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.pos_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  name TEXT NOT NULL DEFAULT 'نقطة بيع 1',
  cash_account_code TEXT NOT NULL DEFAULT '1110',
  revenue_account_code TEXT NOT NULL DEFAULT '4100',
  cogs_account_code TEXT NOT NULL DEFAULT '5200',
  inventory_account_code TEXT NOT NULL DEFAULT '1200',
  receivable_account_code TEXT NOT NULL DEFAULT '1130',
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own terminals" ON public.pos_terminals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_pos_terminals_updated_at BEFORE UPDATE ON public.pos_terminals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. POS Sessions (Shifts)
CREATE TABLE public.pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.pos_companies(id),
  terminal_id UUID NOT NULL REFERENCES public.pos_terminals(id),
  cashier_name TEXT,
  state TEXT NOT NULL DEFAULT 'open',
  opening_cash NUMERIC NOT NULL DEFAULT 0,
  closing_cash NUMERIC,
  expected_cash NUMERIC,
  cash_variance NUMERIC,
  total_sales NUMERIC NOT NULL DEFAULT 0,
  total_returns NUMERIC NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  supervisor_approved BOOLEAN DEFAULT false,
  supervisor_note TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions" ON public.pos_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_pos_sessions_updated_at BEFORE UPDATE ON public.pos_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. POS Orders
CREATE TABLE public.pos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.pos_companies(id),
  session_id UUID NOT NULL REFERENCES public.pos_sessions(id),
  order_number TEXT,
  customer_id UUID REFERENCES public.contacts(id),
  customer_name TEXT,
  state TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT DEFAULT 'fixed',
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ILS',
  is_return BOOLEAN NOT NULL DEFAULT false,
  return_of_order_id UUID REFERENCES public.pos_orders(id),
  return_reason TEXT,
  linked_transaction_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own orders" ON public.pos_orders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_pos_orders_updated_at BEFORE UPDATE ON public.pos_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. POS Order Lines
CREATE TABLE public.pos_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  qty NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'قطعة',
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount_pct NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own order lines" ON public.pos_order_lines FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. POS Payments (split payment support)
CREATE TABLE public.pos_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC NOT NULL DEFAULT 0,
  tendered NUMERIC NOT NULL DEFAULT 0,
  change_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ILS',
  reference TEXT,
  cheque_number TEXT,
  cheque_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payments" ON public.pos_payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Stock Valuation Layers (FIFO)
CREATE TABLE public.stock_valuation_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.pos_companies(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  remaining_qty NUMERIC NOT NULL DEFAULT 0,
  remaining_value NUMERIC NOT NULL DEFAULT 0,
  layer_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference TEXT,
  move_type TEXT NOT NULL DEFAULT 'in',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_valuation_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own layers" ON public.stock_valuation_layers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Add POS-specific columns to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pos_available BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3B82F6',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_weighted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_sort_order INTEGER DEFAULT 0;

-- 9. Auto-generate order numbers
CREATE OR REPLACE FUNCTION public.generate_pos_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.pos_orders
  WHERE session_id = NEW.session_id;
  
  NEW.order_number := 'POS-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pos_order_number
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION public.generate_pos_order_number();

-- 10. Atomic POS order completion function
CREATE OR REPLACE FUNCTION public.complete_pos_order(
  p_order_id UUID,
  p_user_id UUID,
  p_payments JSONB DEFAULT '[]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_line RECORD;
  v_payment RECORD;
  v_terminal RECORD;
  v_tx_id UUID;
  v_total_paid NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
  v_idempotency TEXT;
BEGIN
  -- Get order
  SELECT o.*, s.terminal_id INTO v_order
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  WHERE o.id = p_order_id AND o.user_id = p_user_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_order.state = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  -- Get terminal config
  SELECT * INTO v_terminal
  FROM public.pos_terminals
  WHERE id = v_order.terminal_id;

  -- Idempotency
  v_idempotency := 'POS-ORDER-' || p_order_id::TEXT;

  -- Insert payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (
      user_id, order_id, payment_method, amount, tendered, change_amount, currency, reference
    ) VALUES (
      p_user_id,
      p_order_id,
      COALESCE(v_payment.value->>'method', 'cash'),
      COALESCE((v_payment.value->>'amount')::NUMERIC, 0),
      COALESCE((v_payment.value->>'tendered')::NUMERIC, 0),
      COALESCE((v_payment.value->>'change')::NUMERIC, 0),
      'ILS',
      v_payment.value->>'reference'
    );
    v_total_paid := v_total_paid + COALESCE((v_payment.value->>'amount')::NUMERIC, 0);
  END LOOP;

  -- Calculate COGS from order lines
  SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
  FROM public.pos_order_lines
  WHERE order_id = p_order_id;

  -- Deduct stock from products
  FOR v_line IN SELECT * FROM public.pos_order_lines WHERE order_id = p_order_id
  LOOP
    IF v_line.product_id IS NOT NULL THEN
      UPDATE public.products
      SET quantity = quantity - v_line.qty
      WHERE id = v_line.product_id AND user_id = p_user_id;
    END IF;
  END LOOP;

  -- Create sales journal entry
  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key
  ) VALUES (
    p_user_id, CURRENT_DATE,
    'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number, ''),
    COALESCE(v_terminal.cash_account_code, '1110'),
    COALESCE(v_terminal.revenue_account_code, '4100'),
    v_order.total,
    'شيكل',
    'pos_sale',
    v_order.customer_id,
    v_order.order_number,
    'نقدي',
    v_idempotency
  )
  RETURNING id INTO v_tx_id;

  -- Create COGS journal entry if there's cost
  IF v_total_cogs > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'تكلفة بضاعة مباعة - ' || COALESCE(v_order.order_number, ''),
      COALESCE(v_terminal.cogs_account_code, '5200'),
      COALESCE(v_terminal.inventory_account_code, '1200'),
      v_total_cogs,
      'شيكل',
      'pos_cogs',
      v_order.order_number,
      'COGS-' || p_order_id::TEXT
    );
  END IF;

  -- Update order state
  UPDATE public.pos_orders
  SET state = 'paid', linked_transaction_id = v_tx_id, updated_at = now()
  WHERE id = p_order_id;

  -- Update session totals
  UPDATE public.pos_sessions
  SET total_sales = total_sales + v_order.total,
      total_orders = total_orders + 1,
      updated_at = now()
  WHERE id = v_order.session_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'order_number', v_order.order_number,
    'total', v_order.total,
    'cogs', v_total_cogs
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
