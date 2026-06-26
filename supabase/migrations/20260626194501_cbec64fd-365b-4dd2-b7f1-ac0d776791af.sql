
-- ============================================================
-- SPARTA PHASE 2: SALES / INVOICES (fixed)
-- ============================================================

CREATE TABLE public.sparta_customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  code         text,
  name         text NOT NULL,
  clinic_name  text,
  doctor_name  text,
  phone        text,
  email        text,
  address      text,
  city         text,
  tax_id       text,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  balance      numeric(14,2) NOT NULL DEFAULT 0,
  sales_rep_id uuid,
  notes        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid NOT NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_customers TO authenticated;
GRANT ALL ON public.sparta_customers TO service_role;
ALTER TABLE public.sparta_customers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sparta_customers_company ON public.sparta_customers(company_id);
CREATE INDEX idx_sparta_customers_search  ON public.sparta_customers(company_id, name);
CREATE UNIQUE INDEX uq_sparta_customers_code ON public.sparta_customers(company_id, code) WHERE code IS NOT NULL;

CREATE POLICY "sparta_customers_select" ON public.sparta_customers
  FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_customers_insert" ON public.sparta_customers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_customers_update" ON public.sparta_customers
  FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id())
  WITH CHECK (company_id = public.sparta_holding_id());
CREATE POLICY "sparta_customers_delete" ON public.sparta_customers
  FOR DELETE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id() AND balance = 0);

CREATE TABLE public.sparta_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  invoice_number  text NOT NULL,
  customer_id     uuid NOT NULL REFERENCES public.sparta_customers(id) ON DELETE RESTRICT,
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  warehouse_id    uuid,
  currency        text NOT NULL DEFAULT 'ILS',
  exchange_rate   numeric(14,6) NOT NULL DEFAULT 1,
  subtotal        numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate        numeric(6,3)  NOT NULL DEFAULT 0,
  tax_amount      numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount     numeric(14,2) NOT NULL DEFAULT 0,
  balance_due     numeric(14,2) NOT NULL DEFAULT 0,
  sales_rep_id    uuid,
  notes           text,
  posted_at       timestamptz,
  posted_by       uuid,
  cancelled_at    timestamptz,
  cancelled_by    uuid,
  cancel_reason   text,
  created_by      uuid NOT NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_invoices TO authenticated;
GRANT ALL ON public.sparta_invoices TO service_role;
ALTER TABLE public.sparta_invoices ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX uq_sparta_invoices_number ON public.sparta_invoices(company_id, invoice_number);
CREATE INDEX idx_sparta_invoices_customer    ON public.sparta_invoices(company_id, customer_id, invoice_date DESC);
CREATE INDEX idx_sparta_invoices_status      ON public.sparta_invoices(company_id, status, invoice_date DESC);

CREATE POLICY "sparta_invoices_select" ON public.sparta_invoices
  FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_invoices_insert" ON public.sparta_invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_invoices_update" ON public.sparta_invoices
  FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id())
  WITH CHECK (company_id = public.sparta_holding_id());
CREATE POLICY "sparta_invoices_delete" ON public.sparta_invoices
  FOR DELETE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id() AND status = 'draft');

CREATE TABLE public.sparta_invoice_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES public.sparta_invoices(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL,
  product_name    text NOT NULL,
  sku             text,
  quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price      numeric(14,2) NOT NULL DEFAULT 0,
  discount        numeric(14,2) NOT NULL DEFAULT 0,
  line_total      numeric(14,2) NOT NULL DEFAULT 0,
  cost_total      numeric(14,2) NOT NULL DEFAULT 0,
  consumed_batches jsonb,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_invoice_items TO authenticated;
GRANT ALL ON public.sparta_invoice_items TO service_role;
ALTER TABLE public.sparta_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sparta_invoice_items_invoice ON public.sparta_invoice_items(invoice_id);
CREATE INDEX idx_sparta_invoice_items_product ON public.sparta_invoice_items(product_id);

CREATE POLICY "sparta_invoice_items_select" ON public.sparta_invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sparta_invoices i
                  WHERE i.id = invoice_id
                    AND public.is_sparta_holding_member(auth.uid())
                    AND i.company_id = public.sparta_holding_id()));
CREATE POLICY "sparta_invoice_items_modify" ON public.sparta_invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sparta_invoices i
                  WHERE i.id = invoice_id
                    AND public.is_sparta_holding_admin(auth.uid())
                    AND i.company_id = public.sparta_holding_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sparta_invoices i
                       WHERE i.id = invoice_id
                         AND public.is_sparta_holding_admin(auth.uid())
                         AND i.company_id = public.sparta_holding_id()));

CREATE TABLE public.sparta_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  invoice_id    uuid NOT NULL REFERENCES public.sparta_invoices(id) ON DELETE RESTRICT,
  customer_id   uuid NOT NULL REFERENCES public.sparta_customers(id) ON DELETE RESTRICT,
  payment_date  date NOT NULL DEFAULT CURRENT_DATE,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  currency      text NOT NULL DEFAULT 'ILS',
  method        text NOT NULL CHECK (method IN ('cash','transfer','cheque','card')),
  reference     text,
  notes         text,
  is_voided     boolean NOT NULL DEFAULT false,
  voided_at     timestamptz,
  voided_by     uuid,
  created_by    uuid NOT NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_payments TO authenticated;
GRANT ALL ON public.sparta_payments TO service_role;
ALTER TABLE public.sparta_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sparta_payments_invoice  ON public.sparta_payments(invoice_id);
CREATE INDEX idx_sparta_payments_customer ON public.sparta_payments(company_id, customer_id, payment_date DESC);

CREATE POLICY "sparta_payments_select" ON public.sparta_payments
  FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_payments_insert" ON public.sparta_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_payments_update" ON public.sparta_payments
  FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id())
  WITH CHECK (company_id = public.sparta_holding_id());

-- ============================================================
-- Helpers / Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.sparta_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_sparta_customers_touch BEFORE UPDATE ON public.sparta_customers
  FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at();
CREATE TRIGGER trg_sparta_invoices_touch BEFORE UPDATE ON public.sparta_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at();

CREATE OR REPLACE FUNCTION public.sparta_recalc_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _sub numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(line_total),0) INTO _sub
    FROM public.sparta_invoice_items WHERE invoice_id = _invoice_id;
  UPDATE public.sparta_invoices SET
    subtotal    = _sub,
    tax_amount  = ROUND((GREATEST(_sub - COALESCE(discount_amount,0),0) * COALESCE(tax_rate,0))::numeric, 2),
    total       = ROUND((GREATEST(_sub - COALESCE(discount_amount,0),0) * (1 + COALESCE(tax_rate,0)))::numeric, 2),
    balance_due = ROUND((GREATEST(_sub - COALESCE(discount_amount,0),0) * (1 + COALESCE(tax_rate,0)) - COALESCE(paid_amount,0))::numeric, 2)
  WHERE id = _invoice_id;
END $$;

CREATE OR REPLACE FUNCTION public.sparta_invoice_items_bef()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.sparta_invoices
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF _status IN ('posted','cancelled') THEN
    RAISE EXCEPTION 'لا يمكن تعديل أصناف فاتورة %', _status;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    NEW.line_total := ROUND((NEW.quantity * NEW.unit_price - COALESCE(NEW.discount,0))::numeric, 2);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.sparta_invoice_items_aft()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.sparta_recalc_invoice(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_sparta_items_bef
  BEFORE INSERT OR UPDATE OR DELETE ON public.sparta_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.sparta_invoice_items_bef();
CREATE TRIGGER trg_sparta_items_aft
  AFTER INSERT OR UPDATE OR DELETE ON public.sparta_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.sparta_invoice_items_aft();

-- Customer balance
CREATE OR REPLACE FUNCTION public.sparta_recalc_customer_balance(_customer_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _inv numeric(14,2); _paid numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(total),0) INTO _inv
    FROM public.sparta_invoices WHERE customer_id = _customer_id AND status = 'posted';
  SELECT COALESCE(SUM(amount),0) INTO _paid
    FROM public.sparta_payments WHERE customer_id = _customer_id AND is_voided = false;
  UPDATE public.sparta_customers SET balance = ROUND((_inv - _paid)::numeric, 2) WHERE id = _customer_id;
END $$;

CREATE OR REPLACE FUNCTION public.sparta_invoice_balance_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.sparta_recalc_customer_balance(COALESCE(NEW.customer_id, OLD.customer_id));
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_sparta_invoice_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.sparta_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sparta_invoice_balance_trigger();

CREATE OR REPLACE FUNCTION public.sparta_payment_balance_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _new_paid numeric(14,2); _iid uuid; _cid uuid;
BEGIN
  _iid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  _cid := COALESCE(NEW.customer_id, OLD.customer_id);
  PERFORM public.sparta_recalc_customer_balance(_cid);
  SELECT COALESCE(SUM(amount),0) INTO _new_paid
    FROM public.sparta_payments WHERE invoice_id = _iid AND is_voided = false;
  UPDATE public.sparta_invoices
     SET paid_amount = _new_paid,
         balance_due = ROUND((total - _new_paid)::numeric, 2)
   WHERE id = _iid;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_sparta_payment_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.sparta_payments
  FOR EACH ROW EXECUTE FUNCTION public.sparta_payment_balance_trigger();

-- Numbering
CREATE OR REPLACE FUNCTION public.sparta_next_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _yr text := to_char(now(),'YYYY'); _n int;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, 'SPI-' || _yr || '-(\d+)'))[1]::int), 0) + 1
    INTO _n FROM public.sparta_invoices
   WHERE company_id = public.sparta_holding_id()
     AND invoice_number LIKE 'SPI-' || _yr || '-%';
  RETURN 'SPI-' || _yr || '-' || lpad(_n::text, 4, '0');
END $$;
GRANT EXECUTE ON FUNCTION public.sparta_next_invoice_number() TO authenticated;

-- Post invoice
CREATE OR REPLACE FUNCTION public.sparta_post_invoice(_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv RECORD; _item RECORD; _result jsonb; _cost numeric(14,2); _total_cost numeric(14,2) := 0;
  _is_tracked boolean;
BEGIN
  IF NOT public.is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'صلاحية مدير القابضة مطلوبة';
  END IF;
  SELECT * INTO _inv FROM public.sparta_invoices
    WHERE id = _invoice_id AND company_id = public.sparta_holding_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF _inv.status <> 'draft' THEN RAISE EXCEPTION 'الفاتورة ليست مسودة'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sparta_invoice_items WHERE invoice_id = _invoice_id) THEN
    RAISE EXCEPTION 'لا يمكن اعتماد فاتورة بدون أصناف';
  END IF;

  FOR _item IN SELECT * FROM public.sparta_invoice_items WHERE invoice_id = _invoice_id LOOP
    SELECT COALESCE(requires_batch_tracking,false) INTO _is_tracked
      FROM public.products WHERE id = _item.product_id;
    IF _is_tracked THEN
      _result := public.consume_batches_fifo(
        _company_id := public.sparta_holding_id(),
        _product_id := _item.product_id,
        _warehouse_id := _inv.warehouse_id,
        _quantity := _item.quantity,
        _reference_type := 'sparta_invoice',
        _reference_id := _invoice_id
      );
      SELECT COALESCE(buy_price,0) * _item.quantity INTO _cost FROM public.products WHERE id = _item.product_id;
      UPDATE public.sparta_invoice_items
         SET consumed_batches = _result -> 'consumed', cost_total = ROUND(_cost::numeric, 2)
       WHERE id = _item.id;
    ELSE
      UPDATE public.products SET quantity = quantity - _item.quantity WHERE id = _item.product_id;
      SELECT COALESCE(buy_price,0) * _item.quantity INTO _cost FROM public.products WHERE id = _item.product_id;
      UPDATE public.sparta_invoice_items SET cost_total = ROUND(_cost::numeric, 2) WHERE id = _item.id;
    END IF;
    _total_cost := _total_cost + COALESCE(_cost,0);
  END LOOP;

  UPDATE public.sparta_invoices
     SET status='posted', posted_at=now(), posted_by=auth.uid()
   WHERE id = _invoice_id;

  RETURN jsonb_build_object('ok', true, 'invoice_id', _invoice_id, 'cogs', _total_cost);
END $$;
GRANT EXECUTE ON FUNCTION public.sparta_post_invoice(uuid) TO authenticated;

-- Cancel invoice
CREATE OR REPLACE FUNCTION public.sparta_cancel_invoice(_invoice_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv RECORD; _mv RECORD;
BEGIN
  IF NOT public.is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'صلاحية مدير القابضة مطلوبة';
  END IF;
  SELECT * INTO _inv FROM public.sparta_invoices
    WHERE id = _invoice_id AND company_id = public.sparta_holding_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF EXISTS (SELECT 1 FROM public.sparta_payments WHERE invoice_id=_invoice_id AND is_voided=false) THEN
    RAISE EXCEPTION 'لا يمكن إلغاء فاتورة عليها دفعات نشطة';
  END IF;
  IF _inv.status = 'posted' THEN
    FOR _mv IN SELECT * FROM public.batch_movements
                WHERE reference_type='sparta_invoice' AND reference_id=_invoice_id AND direction='out' LOOP
      UPDATE public.product_batches
         SET quantity_remaining = quantity_remaining + _mv.quantity
       WHERE id = _mv.batch_id;
      INSERT INTO public.batch_movements(
        company_id, batch_id, product_id, warehouse_id,
        quantity, direction, reference_type, reference_id, notes, created_by
      ) VALUES (
        _mv.company_id, _mv.batch_id, _mv.product_id, _mv.warehouse_id,
        _mv.quantity, 'in', 'sparta_invoice_cancel', _invoice_id,
        'استرجاع كمية بسبب إلغاء فاتورة', auth.uid()
      );
    END LOOP;
  END IF;
  UPDATE public.sparta_invoices
     SET status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), cancel_reason=_reason
   WHERE id = _invoice_id;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.sparta_cancel_invoice(uuid, text) TO authenticated;

-- Record payment
CREATE OR REPLACE FUNCTION public.sparta_record_payment(
  _invoice_id uuid, _amount numeric, _method text,
  _currency text DEFAULT 'ILS', _reference text DEFAULT NULL,
  _payment_date date DEFAULT CURRENT_DATE, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv RECORD; _pid uuid;
BEGIN
  IF NOT public.is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'صلاحية مدير القابضة مطلوبة';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'قيمة الدفعة يجب أن تكون أكبر من صفر';
  END IF;
  SELECT * INTO _inv FROM public.sparta_invoices
    WHERE id = _invoice_id AND company_id = public.sparta_holding_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF _inv.status <> 'posted' THEN RAISE EXCEPTION 'لا يمكن تسجيل دفعة على فاتورة %', _inv.status; END IF;
  IF _amount > _inv.balance_due + 0.01 THEN
    RAISE EXCEPTION 'قيمة الدفعة (%) تتجاوز الرصيد المستحق (%)', _amount, _inv.balance_due;
  END IF;
  INSERT INTO public.sparta_payments(
    company_id, invoice_id, customer_id, payment_date, amount, currency, method, reference, notes
  ) VALUES (
    public.sparta_holding_id(), _invoice_id, _inv.customer_id, _payment_date,
    _amount, _currency, _method, _reference, _notes
  ) RETURNING id INTO _pid;
  RETURN _pid;
END $$;
GRANT EXECUTE ON FUNCTION public.sparta_record_payment(uuid, numeric, text, text, text, date, text) TO authenticated;
