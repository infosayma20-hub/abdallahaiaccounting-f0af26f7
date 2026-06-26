
-- ============= 5B.1 Bills (AP) =============
CREATE TABLE public.sparta_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bill_number text NOT NULL,
  supplier_id uuid,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'draft', -- draft|posted|paid|cancelled
  currency text NOT NULL DEFAULT 'ILS',
  exchange_rate numeric NOT NULL DEFAULT 1,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  expense_account_id uuid, -- which expense to debit (default 5190)
  notes text,
  posted_at timestamptz,
  posted_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, bill_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_bills TO authenticated;
GRANT ALL ON public.sparta_bills TO service_role;
ALTER TABLE public.sparta_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta members bills"
ON public.sparta_bills FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bills.company_id AND hm.auth_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bills.company_id AND hm.auth_user_id = auth.uid()));

CREATE TABLE public.sparta_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bill_id uuid REFERENCES public.sparta_bills(id) ON DELETE RESTRICT,
  supplier_id uuid,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  method text NOT NULL DEFAULT 'cash', -- cash|bank|cheque
  bank_account_id uuid,
  reference text,
  notes text,
  is_voided boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  voided_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_bill_payments TO authenticated;
GRANT ALL ON public.sparta_bill_payments TO service_role;
ALTER TABLE public.sparta_bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta members bill payments"
ON public.sparta_bill_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bill_payments.company_id AND hm.auth_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bill_payments.company_id AND hm.auth_user_id = auth.uid()));

-- ============= 5B.2 Bank Accounts =============
CREATE TABLE public.sparta_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  account_id uuid REFERENCES public.sparta_accounts(id), -- GL link (under 1120)
  name text NOT NULL,
  bank_name text,
  account_number text,
  iban text,
  currency text NOT NULL DEFAULT 'ILS',
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_bank_accounts TO authenticated;
GRANT ALL ON public.sparta_bank_accounts TO service_role;
ALTER TABLE public.sparta_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta members bank accounts"
ON public.sparta_bank_accounts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bank_accounts.company_id AND hm.auth_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bank_accounts.company_id AND hm.auth_user_id = auth.uid()));

CREATE TABLE public.sparta_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.sparta_bank_accounts(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  reference text,
  reconciled boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  reconciled_by uuid,
  ref_type text, -- payment|bill_payment|manual|transfer
  ref_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_bank_transactions TO authenticated;
GRANT ALL ON public.sparta_bank_transactions TO service_role;
ALTER TABLE public.sparta_bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta members bank txns"
ON public.sparta_bank_transactions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bank_transactions.company_id AND hm.auth_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM holding_members hm WHERE hm.holding_id = sparta_bank_transactions.company_id AND hm.auth_user_id = auth.uid()));

CREATE INDEX idx_sparta_bills_company ON public.sparta_bills(company_id, status);
CREATE INDEX idx_sparta_bill_payments_bill ON public.sparta_bill_payments(bill_id);
CREATE INDEX idx_sparta_bank_txns_account ON public.sparta_bank_transactions(bank_account_id, txn_date);

-- ============= 5B.3 Helper: parent detection & account lookup =============
CREATE OR REPLACE FUNCTION public.sparta_account_id_by_code(_holding uuid, _code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM sparta_accounts WHERE holding_id = _holding AND code = _code LIMIT 1;
$$;

-- ============= 5B.4 Auto-post Sales Invoice =============
CREATE OR REPLACE FUNCTION public.sparta_post_invoice_journal(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_inv RECORD;
  v_holding uuid;
  v_entry_id uuid;
  v_ar uuid; v_rev uuid; v_vat uuid; v_cogs uuid; v_inv_acc uuid;
  v_total_cost numeric;
  v_entry_no text;
BEGIN
  SELECT * INTO v_inv FROM sparta_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  v_holding := v_inv.company_id;

  v_ar  := sparta_account_id_by_code(v_holding, '1130');
  v_rev := sparta_account_id_by_code(v_holding, '4110');
  v_vat := sparta_account_id_by_code(v_holding, '2130');
  v_cogs:= sparta_account_id_by_code(v_holding, '5110');
  v_inv_acc := sparta_account_id_by_code(v_holding, '1140');

  SELECT COALESCE(SUM(cost_total),0) INTO v_total_cost FROM sparta_invoice_items WHERE invoice_id = _invoice_id;

  v_entry_no := 'AUTO-INV-' || COALESCE(v_inv.invoice_number, _invoice_id::text);

  INSERT INTO sparta_journal_entries(holding_id, entry_no, entry_date, ref_type, ref_id, status, description, total_debit, total_credit, created_by, posted_at, posted_by)
  VALUES (v_holding, v_entry_no, v_inv.invoice_date, 'sales_invoice', _invoice_id, 'posted',
          'قيد فاتورة مبيعات ' || COALESCE(v_inv.invoice_number,''), 
          v_inv.total + v_total_cost, v_inv.total + v_total_cost,
          auth.uid(), now(), auth.uid())
  RETURNING id INTO v_entry_id;

  -- DR Receivables, CR Revenue + VAT
  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, customer_id, line_no, description)
  VALUES (v_entry_id, v_holding, v_ar, v_inv.total, 0, v_inv.customer_id, 1, 'ذمم العميل');

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, customer_id, line_no, description)
  VALUES (v_entry_id, v_holding, v_rev, 0, v_inv.subtotal - COALESCE(v_inv.discount_amount,0), v_inv.customer_id, 2, 'إيرادات المبيعات');

  IF COALESCE(v_inv.tax_amount,0) > 0 THEN
    INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, line_no, description)
    VALUES (v_entry_id, v_holding, v_vat, 0, v_inv.tax_amount, 3, 'ضريبة القيمة المضافة');
  END IF;

  -- COGS
  IF v_total_cost > 0 THEN
    INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, line_no, description)
    VALUES (v_entry_id, v_holding, v_cogs, v_total_cost, 0, 4, 'تكلفة البضاعة المباعة');
    INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, line_no, description)
    VALUES (v_entry_id, v_holding, v_inv_acc, 0, v_total_cost, 5, 'خصم المخزون');
  END IF;

  RETURN v_entry_id;
END;
$$;

-- Trigger on invoice status transition to 'posted'
CREATE OR REPLACE FUNCTION public.sparta_invoice_autopost_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    IF NOT EXISTS (SELECT 1 FROM sparta_journal_entries WHERE ref_type='sales_invoice' AND ref_id=NEW.id AND status='posted') THEN
      PERFORM sparta_post_invoice_journal(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sparta_invoice_autopost ON public.sparta_invoices;
CREATE TRIGGER trg_sparta_invoice_autopost
AFTER INSERT OR UPDATE OF status ON public.sparta_invoices
FOR EACH ROW EXECUTE FUNCTION sparta_invoice_autopost_trg();

-- ============= 5B.5 Auto-post Payment =============
CREATE OR REPLACE FUNCTION public.sparta_post_payment_journal(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_p RECORD; v_holding uuid; v_entry_id uuid;
  v_cash uuid; v_bank uuid; v_ar uuid; v_dr_acc uuid;
BEGIN
  SELECT * INTO v_p FROM sparta_payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  v_holding := v_p.company_id;

  v_cash := sparta_account_id_by_code(v_holding, '1110');
  v_bank := sparta_account_id_by_code(v_holding, '1120');
  v_ar   := sparta_account_id_by_code(v_holding, '1130');
  v_dr_acc := CASE WHEN v_p.method IN ('cash') THEN v_cash ELSE v_bank END;

  INSERT INTO sparta_journal_entries(holding_id, entry_no, entry_date, ref_type, ref_id, status, description, total_debit, total_credit, created_by, posted_at, posted_by)
  VALUES (v_holding, 'AUTO-PAY-' || _payment_id::text, v_p.payment_date, 'payment', _payment_id, 'posted',
          'قبض دفعة من عميل', v_p.amount, v_p.amount, auth.uid(), now(), auth.uid())
  RETURNING id INTO v_entry_id;

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, line_no, description)
  VALUES (v_entry_id, v_holding, v_dr_acc, v_p.amount, 0, 1, 'تحصيل نقدي/بنكي');

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, customer_id, line_no, description)
  VALUES (v_entry_id, v_holding, v_ar, 0, v_p.amount, v_p.customer_id, 2, 'سداد ذمم العميل');

  -- Update invoice paid_amount
  IF v_p.invoice_id IS NOT NULL THEN
    UPDATE sparta_invoices SET paid_amount = paid_amount + v_p.amount,
                               balance_due = GREATEST(total - (paid_amount + v_p.amount), 0)
    WHERE id = v_p.invoice_id;
  END IF;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sparta_payment_autopost_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_voided = false THEN
    PERFORM sparta_post_payment_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sparta_payment_autopost ON public.sparta_payments;
CREATE TRIGGER trg_sparta_payment_autopost
AFTER INSERT ON public.sparta_payments
FOR EACH ROW EXECUTE FUNCTION sparta_payment_autopost_trg();

-- ============= 5B.6 Auto-post Bill & Bill Payment =============
CREATE OR REPLACE FUNCTION public.sparta_post_bill_journal(_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_b RECORD; v_holding uuid; v_entry_id uuid;
  v_ap uuid; v_exp uuid; v_vat uuid;
BEGIN
  SELECT * INTO v_b FROM sparta_bills WHERE id = _bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  v_holding := v_b.company_id;

  v_ap  := sparta_account_id_by_code(v_holding, '2110');
  v_exp := COALESCE(v_b.expense_account_id, sparta_account_id_by_code(v_holding, '5190'));
  v_vat := sparta_account_id_by_code(v_holding, '2130');

  INSERT INTO sparta_journal_entries(holding_id, entry_no, entry_date, ref_type, ref_id, status, description, total_debit, total_credit, created_by, posted_at, posted_by)
  VALUES (v_holding, 'AUTO-BILL-' || COALESCE(v_b.bill_number, _bill_id::text), v_b.bill_date, 'bill', _bill_id, 'posted',
          'قيد فاتورة مورد ' || COALESCE(v_b.bill_number,''), v_b.total, v_b.total, auth.uid(), now(), auth.uid())
  RETURNING id INTO v_entry_id;

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, supplier_id, line_no, description)
  VALUES (v_entry_id, v_holding, v_exp, v_b.subtotal, 0, v_b.supplier_id, 1, 'مصروف');

  IF COALESCE(v_b.tax_amount,0) > 0 THEN
    INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, line_no, description)
    VALUES (v_entry_id, v_holding, v_vat, v_b.tax_amount, 0, 2, 'ضريبة قابلة للاسترداد');
  END IF;

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, supplier_id, line_no, description)
  VALUES (v_entry_id, v_holding, v_ap, 0, v_b.total, v_b.supplier_id, 3, 'ذمم المورد');

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sparta_bill_autopost_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  NEW.balance_due := NEW.total - COALESCE(NEW.paid_amount,0);
  IF NEW.status = 'posted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    IF NOT EXISTS (SELECT 1 FROM sparta_journal_entries WHERE ref_type='bill' AND ref_id=NEW.id AND status='posted') THEN
      PERFORM sparta_post_bill_journal(NEW.id);
    END IF;
    NEW.posted_at := COALESCE(NEW.posted_at, now());
    NEW.posted_by := COALESCE(NEW.posted_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sparta_bill_autopost ON public.sparta_bills;
CREATE TRIGGER trg_sparta_bill_autopost
BEFORE INSERT OR UPDATE ON public.sparta_bills
FOR EACH ROW EXECUTE FUNCTION sparta_bill_autopost_trg();

CREATE OR REPLACE FUNCTION public.sparta_post_bill_payment_journal(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_p RECORD; v_holding uuid; v_entry_id uuid;
  v_cash uuid; v_bank uuid; v_ap uuid; v_cr_acc uuid;
BEGIN
  SELECT * INTO v_p FROM sparta_bill_payments WHERE id = _payment_id;
  v_holding := v_p.company_id;
  v_cash := sparta_account_id_by_code(v_holding, '1110');
  v_bank := sparta_account_id_by_code(v_holding, '1120');
  v_ap   := sparta_account_id_by_code(v_holding, '2110');
  v_cr_acc := CASE WHEN v_p.method = 'cash' THEN v_cash ELSE v_bank END;

  INSERT INTO sparta_journal_entries(holding_id, entry_no, entry_date, ref_type, ref_id, status, description, total_debit, total_credit, created_by, posted_at, posted_by)
  VALUES (v_holding, 'AUTO-BPAY-' || _payment_id::text, v_p.payment_date, 'bill_payment', _payment_id, 'posted',
          'دفعة لمورد', v_p.amount, v_p.amount, auth.uid(), now(), auth.uid())
  RETURNING id INTO v_entry_id;

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, supplier_id, line_no, description)
  VALUES (v_entry_id, v_holding, v_ap, v_p.amount, 0, v_p.supplier_id, 1, 'سداد ذمم المورد');

  INSERT INTO sparta_journal_lines(entry_id, holding_id, account_id, debit, credit, line_no, description)
  VALUES (v_entry_id, v_holding, v_cr_acc, 0, v_p.amount, 2, 'دفع نقدي/بنكي');

  IF v_p.bill_id IS NOT NULL THEN
    UPDATE sparta_bills SET paid_amount = paid_amount + v_p.amount WHERE id = v_p.bill_id;
  END IF;

  -- Bank transaction record
  IF v_p.bank_account_id IS NOT NULL THEN
    INSERT INTO sparta_bank_transactions(company_id, bank_account_id, txn_date, direction, amount, description, reference, ref_type, ref_id, created_by)
    VALUES (v_holding, v_p.bank_account_id, v_p.payment_date, 'out', v_p.amount, 'دفعة لمورد', v_p.reference, 'bill_payment', _payment_id, auth.uid());
  END IF;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sparta_bill_payment_autopost_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.is_voided=false THEN
    PERFORM sparta_post_bill_payment_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sparta_bill_payment_autopost ON public.sparta_bill_payments;
CREATE TRIGGER trg_sparta_bill_payment_autopost
AFTER INSERT ON public.sparta_bill_payments
FOR EACH ROW EXECUTE FUNCTION sparta_bill_payment_autopost_trg();

-- Update bank balance trigger
CREATE OR REPLACE FUNCTION public.sparta_bank_txn_balance_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE sparta_bank_accounts SET current_balance = current_balance + CASE WHEN NEW.direction='in' THEN NEW.amount ELSE -NEW.amount END
    WHERE id = NEW.bank_account_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE sparta_bank_accounts SET current_balance = current_balance - CASE WHEN OLD.direction='in' THEN OLD.amount ELSE -OLD.amount END
    WHERE id = OLD.bank_account_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_sparta_bank_txn_balance ON public.sparta_bank_transactions;
CREATE TRIGGER trg_sparta_bank_txn_balance
AFTER INSERT OR DELETE ON public.sparta_bank_transactions
FOR EACH ROW EXECUTE FUNCTION sparta_bank_txn_balance_trg();

-- ============= 5B.7 AR / AP Aging Views =============
CREATE OR REPLACE VIEW public.sparta_ar_aging AS
SELECT 
  i.company_id,
  i.customer_id,
  c.name as customer_name,
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.total,
  i.paid_amount,
  i.balance_due,
  (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date))::int as days_overdue,
  CASE
    WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)) <= 30 THEN '0-30'
    WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)) <= 60 THEN '31-60'
    WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)) <= 90 THEN '61-90'
    ELSE '90+'
  END as aging_bucket
FROM sparta_invoices i
LEFT JOIN sparta_customers c ON c.id = i.customer_id
WHERE i.status = 'posted' AND i.balance_due > 0;

GRANT SELECT ON public.sparta_ar_aging TO authenticated;

CREATE OR REPLACE VIEW public.sparta_ap_aging AS
SELECT
  b.company_id,
  b.supplier_id,
  b.id as bill_id,
  b.bill_number,
  b.bill_date,
  b.due_date,
  b.total,
  b.paid_amount,
  b.balance_due,
  (CURRENT_DATE - COALESCE(b.due_date, b.bill_date))::int as days_overdue,
  CASE
    WHEN (CURRENT_DATE - COALESCE(b.due_date, b.bill_date)) <= 30 THEN '0-30'
    WHEN (CURRENT_DATE - COALESCE(b.due_date, b.bill_date)) <= 60 THEN '31-60'
    WHEN (CURRENT_DATE - COALESCE(b.due_date, b.bill_date)) <= 90 THEN '61-90'
    ELSE '90+'
  END as aging_bucket
FROM sparta_bills b
WHERE b.status = 'posted' AND b.balance_due > 0;

GRANT SELECT ON public.sparta_ap_aging TO authenticated;

-- ============= 5B.8 Income Statement / Balance Sheet RPCs =============
CREATE OR REPLACE FUNCTION public.sparta_income_statement(_holding uuid, _from date, _to date)
RETURNS TABLE(account_code text, account_name text, account_type text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.code, a.name_ar, a.type,
         CASE WHEN a.type='revenue' THEN SUM(l.credit - l.debit)
              ELSE SUM(l.debit - l.credit) END as amount
  FROM sparta_journal_lines l
  JOIN sparta_journal_entries e ON e.id = l.entry_id
  JOIN sparta_accounts a ON a.id = l.account_id
  WHERE e.holding_id = _holding
    AND e.status = 'posted'
    AND e.entry_date BETWEEN _from AND _to
    AND a.type IN ('revenue','expense')
  GROUP BY a.code, a.name_ar, a.type
  HAVING SUM(l.debit + l.credit) > 0
  ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION public.sparta_balance_sheet(_holding uuid, _as_of date)
RETURNS TABLE(account_code text, account_name text, account_type text, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.code, a.name_ar, a.type,
         CASE WHEN a.type IN ('asset','expense') THEN SUM(l.debit - l.credit)
              ELSE SUM(l.credit - l.debit) END as balance
  FROM sparta_journal_lines l
  JOIN sparta_journal_entries e ON e.id = l.entry_id
  JOIN sparta_accounts a ON a.id = l.account_id
  WHERE e.holding_id = _holding
    AND e.status = 'posted'
    AND e.entry_date <= _as_of
    AND a.type IN ('asset','liability','equity')
  GROUP BY a.code, a.name_ar, a.type
  HAVING SUM(l.debit + l.credit) > 0
  ORDER BY a.code;
$$;

-- updated_at triggers
CREATE TRIGGER trg_sparta_bills_updated BEFORE UPDATE ON public.sparta_bills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sparta_bank_accounts_updated BEFORE UPDATE ON public.sparta_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
