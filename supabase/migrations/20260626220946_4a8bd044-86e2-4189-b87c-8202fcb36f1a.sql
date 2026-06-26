
-- ============ Phase 6: Sparta Van Sales ============

-- 1) van_days
CREATE TABLE public.sparta_van_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.sparta_holding_id(),
  sales_rep_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE RESTRICT,
  day_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_cash numeric(14,2) NOT NULL DEFAULT 0,
  total_sales_cash numeric(14,2) NOT NULL DEFAULT 0,
  total_sales_credit numeric(14,2) NOT NULL DEFAULT 0,
  total_collections numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses numeric(14,2) NOT NULL DEFAULT 0,
  expected_cash numeric(14,2) NOT NULL DEFAULT 0,
  actual_cash numeric(14,2),
  variance numeric(14,2),
  notes text,
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sparta_van_days_rep_date ON public.sparta_van_days(sales_rep_id, day_date DESC);
CREATE UNIQUE INDEX uq_sparta_van_days_open_per_rep
  ON public.sparta_van_days(sales_rep_id) WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_van_days TO authenticated;
GRANT ALL ON public.sparta_van_days TO service_role;
ALTER TABLE public.sparta_van_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "van_days_select_members" ON public.sparta_van_days FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()));
CREATE POLICY "van_days_admin_all" ON public.sparta_van_days FOR ALL TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()))
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()));

CREATE TRIGGER trg_sparta_van_days_touch
  BEFORE UPDATE ON public.sparta_van_days
  FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at();

-- 2) cash movements
CREATE TABLE public.sparta_van_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.sparta_holding_id(),
  van_day_id uuid NOT NULL REFERENCES public.sparta_van_days(id) ON DELETE CASCADE,
  sales_rep_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('sale_cash','collection','expense','deposit','opening')),
  amount numeric(14,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  customer_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_van_cash_van_day ON public.sparta_van_cash_movements(van_day_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_van_cash_movements TO authenticated;
GRANT ALL ON public.sparta_van_cash_movements TO service_role;
ALTER TABLE public.sparta_van_cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "van_cash_select_members" ON public.sparta_van_cash_movements FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()));
CREATE POLICY "van_cash_admin_all" ON public.sparta_van_cash_movements FOR ALL TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()))
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()));

-- 3) RPC: open day
CREATE OR REPLACE FUNCTION public.sparta_van_open_day(
  _sales_rep_id uuid,
  _opening_cash numeric DEFAULT 0,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _did uuid;
BEGIN
  IF NOT public.is_sparta_holding_member(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sparta_van_days
             WHERE sales_rep_id = _sales_rep_id AND status = 'open') THEN
    RAISE EXCEPTION 'يوجد جلسة مفتوحة بالفعل لهذا المندوب';
  END IF;
  INSERT INTO public.sparta_van_days(
    sales_rep_id, opening_cash, expected_cash, notes, opened_by
  ) VALUES (
    _sales_rep_id, COALESCE(_opening_cash,0), COALESCE(_opening_cash,0), _notes, auth.uid()
  ) RETURNING id INTO _did;
  INSERT INTO public.sparta_van_cash_movements(
    van_day_id, sales_rep_id, movement_type, amount, notes, created_by
  ) VALUES (_did, _sales_rep_id, 'opening', COALESCE(_opening_cash,0), 'رصيد افتتاحي', auth.uid());
  RETURN _did;
END $$;

-- 4) RPC: create van sale (atomic invoice + post + payment)
CREATE OR REPLACE FUNCTION public.sparta_van_create_sale(
  _van_day_id uuid,
  _customer_id uuid,
  _items jsonb,                 -- [{product_id, product_name, quantity, unit_price, discount?}]
  _payment_method text,         -- 'cash' | 'credit' | 'cheque' | 'transfer'
  _paid_amount numeric DEFAULT NULL,
  _warehouse_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _day RECORD; _inv_id uuid; _inv_no text; _item jsonb;
  _subtotal numeric(14,2) := 0; _line_total numeric(14,2);
  _is_tracked boolean; _cost numeric(14,2); _total_cost numeric(14,2) := 0;
  _pay_amount numeric(14,2);
BEGIN
  IF NOT public.is_sparta_holding_member(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT * INTO _day FROM public.sparta_van_days WHERE id = _van_day_id FOR UPDATE;
  IF NOT FOUND OR _day.status <> 'open' THEN
    RAISE EXCEPTION 'الجلسة غير مفتوحة';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف';
  END IF;

  _inv_no := public.sparta_next_invoice_number();

  INSERT INTO public.sparta_invoices(
    company_id, invoice_number, customer_id, invoice_date,
    status, warehouse_id, currency, exchange_rate, sales_rep_id, notes, created_by
  ) VALUES (
    public.sparta_holding_id(), _inv_no, _customer_id, CURRENT_DATE,
    'draft', _warehouse_id, 'ILS', 1, _day.sales_rep_id, _notes, auth.uid()
  ) RETURNING id INTO _inv_id;

  -- items + stock
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _line_total := ROUND(
      ((_item->>'quantity')::numeric * (_item->>'unit_price')::numeric
       - COALESCE((_item->>'discount')::numeric, 0))::numeric, 2
    );
    INSERT INTO public.sparta_invoice_items(
      invoice_id, product_id, product_name, quantity, unit_price, discount, line_total
    ) VALUES (
      _inv_id,
      NULLIF(_item->>'product_id','')::uuid,
      _item->>'product_name',
      (_item->>'quantity')::numeric,
      (_item->>'unit_price')::numeric,
      COALESCE((_item->>'discount')::numeric, 0),
      _line_total
    );
    _subtotal := _subtotal + _line_total;

    -- stock deduction
    IF (_item->>'product_id') IS NOT NULL THEN
      SELECT COALESCE(requires_batch_tracking,false) INTO _is_tracked
        FROM public.products WHERE id = (_item->>'product_id')::uuid;
      IF _is_tracked THEN
        PERFORM public.consume_batches_fifo(
          _company_id := public.sparta_holding_id(),
          _product_id := (_item->>'product_id')::uuid,
          _warehouse_id := _warehouse_id,
          _quantity := (_item->>'quantity')::numeric,
          _reference_type := 'sparta_invoice',
          _reference_id := _inv_id
        );
      ELSE
        UPDATE public.products SET quantity = quantity - (_item->>'quantity')::numeric
          WHERE id = (_item->>'product_id')::uuid;
      END IF;
      SELECT COALESCE(buy_price,0) * (_item->>'quantity')::numeric INTO _cost
        FROM public.products WHERE id = (_item->>'product_id')::uuid;
      _total_cost := _total_cost + COALESCE(_cost,0);
    END IF;
  END LOOP;

  -- mark posted (recalc trigger sets totals)
  UPDATE public.sparta_invoices
     SET status='posted', posted_at=now(), posted_by=auth.uid()
   WHERE id = _inv_id;

  -- payment
  _pay_amount := COALESCE(_paid_amount, CASE WHEN _payment_method = 'credit' THEN 0 ELSE _subtotal END);
  IF _pay_amount > 0 THEN
    INSERT INTO public.sparta_payments(
      company_id, invoice_id, customer_id, payment_date, amount, currency, method, notes, created_by
    ) VALUES (
      public.sparta_holding_id(), _inv_id, _customer_id, CURRENT_DATE,
      _pay_amount, 'ILS', _payment_method, _notes, auth.uid()
    );
  END IF;

  -- van day rollups
  IF _payment_method = 'cash' AND _pay_amount > 0 THEN
    UPDATE public.sparta_van_days
       SET total_sales_cash = total_sales_cash + _pay_amount,
           expected_cash    = expected_cash + _pay_amount
     WHERE id = _van_day_id;
    INSERT INTO public.sparta_van_cash_movements(
      van_day_id, sales_rep_id, movement_type, amount,
      reference_type, reference_id, customer_id, notes, created_by
    ) VALUES (
      _van_day_id, _day.sales_rep_id, 'sale_cash', _pay_amount,
      'sparta_invoice', _inv_id, _customer_id, 'فاتورة ' || _inv_no, auth.uid()
    );
  ELSE
    UPDATE public.sparta_van_days
       SET total_sales_credit = total_sales_credit + GREATEST(_subtotal - _pay_amount, 0)
     WHERE id = _van_day_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'invoice_id', _inv_id, 'invoice_number', _inv_no,
    'subtotal', _subtotal, 'paid', _pay_amount
  );
END $$;

-- 5) RPC: collect payment (allocates to oldest unpaid invoices)
CREATE OR REPLACE FUNCTION public.sparta_van_collect_payment(
  _van_day_id uuid,
  _customer_id uuid,
  _amount numeric,
  _method text DEFAULT 'cash',
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _day RECORD; _remaining numeric(14,2); _inv RECORD; _take numeric(14,2);
  _allocated jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_sparta_holding_member(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'القيمة يجب أن تكون موجبة'; END IF;
  SELECT * INTO _day FROM public.sparta_van_days WHERE id = _van_day_id FOR UPDATE;
  IF NOT FOUND OR _day.status <> 'open' THEN RAISE EXCEPTION 'الجلسة غير مفتوحة'; END IF;

  _remaining := _amount;
  FOR _inv IN
    SELECT id, invoice_number, balance_due FROM public.sparta_invoices
     WHERE customer_id = _customer_id AND status = 'posted' AND balance_due > 0.01
     ORDER BY invoice_date ASC, created_at ASC
  LOOP
    EXIT WHEN _remaining <= 0;
    _take := LEAST(_remaining, _inv.balance_due);
    INSERT INTO public.sparta_payments(
      company_id, invoice_id, customer_id, payment_date, amount, currency, method, notes, created_by
    ) VALUES (
      public.sparta_holding_id(), _inv.id, _customer_id, CURRENT_DATE,
      _take, 'ILS', _method, _notes, auth.uid()
    );
    _allocated := _allocated || jsonb_build_object('invoice_number', _inv.invoice_number, 'amount', _take);
    _remaining := _remaining - _take;
  END LOOP;

  -- unallocated remainder → credit balance (record without invoice link not allowed by schema; ignore for now)
  IF _remaining > 0.01 THEN
    RAISE EXCEPTION 'مبلغ التحصيل يتجاوز إجمالي ديون الزبون بـ % ', _remaining;
  END IF;

  IF _method = 'cash' THEN
    UPDATE public.sparta_van_days
       SET total_collections = total_collections + _amount,
           expected_cash     = expected_cash + _amount
     WHERE id = _van_day_id;
    INSERT INTO public.sparta_van_cash_movements(
      van_day_id, sales_rep_id, movement_type, amount, customer_id, notes, created_by
    ) VALUES (
      _van_day_id, _day.sales_rep_id, 'collection', _amount, _customer_id,
      COALESCE(_notes, 'تحصيل'), auth.uid()
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'allocated', _allocated);
END $$;

-- 6) RPC: close day
CREATE OR REPLACE FUNCTION public.sparta_van_close_day(
  _van_day_id uuid,
  _actual_cash numeric,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _day RECORD; _var numeric(14,2);
BEGIN
  IF NOT public.is_sparta_holding_member(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT * INTO _day FROM public.sparta_van_days WHERE id = _van_day_id FOR UPDATE;
  IF NOT FOUND OR _day.status <> 'open' THEN RAISE EXCEPTION 'الجلسة غير مفتوحة'; END IF;
  _var := COALESCE(_actual_cash,0) - _day.expected_cash;
  UPDATE public.sparta_van_days
     SET status='closed', actual_cash=_actual_cash, variance=_var,
         notes = COALESCE(_notes, notes),
         closed_by = auth.uid(), closed_at = now()
   WHERE id = _van_day_id;
  RETURN jsonb_build_object('ok', true, 'variance', _var, 'expected', _day.expected_cash);
END $$;

GRANT EXECUTE ON FUNCTION public.sparta_van_open_day(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sparta_van_create_sale(uuid,uuid,jsonb,text,numeric,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sparta_van_collect_payment(uuid,uuid,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sparta_van_close_day(uuid,numeric,text) TO authenticated;
