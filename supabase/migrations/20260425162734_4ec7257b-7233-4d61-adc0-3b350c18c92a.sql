-- =====================================================
-- RETURNS MODULE — Independent Entity (Production-Ready)
-- =====================================================

-- 1) ENUM for return type
DO $$ BEGIN
  CREATE TYPE public.return_type_enum AS ENUM ('sales', 'purchase');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.return_status_enum AS ENUM ('draft', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) returns table (independent from invoices)
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID,
  return_type public.return_type_enum NOT NULL,
  return_number TEXT NOT NULL,
  related_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.return_status_enum NOT NULL DEFAULT 'draft',
  reason TEXT,
  notes TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_method TEXT,
  refund_account_code TEXT,
  journal_entry_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT returns_number_unique_per_user UNIQUE (user_id, return_type, return_number)
);

CREATE INDEX IF NOT EXISTS idx_returns_user ON public.returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_type ON public.returns(return_type);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON public.returns(related_invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_contact ON public.returns(contact_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON public.returns(return_date);

-- 3) return_items
CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source_invoice_item_id UUID,
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON public.return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON public.return_items(product_id);

-- 4) RLS
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_select_own" ON public.returns;
CREATE POLICY "returns_select_own" ON public.returns FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "returns_insert_own" ON public.returns;
CREATE POLICY "returns_insert_own" ON public.returns FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "returns_update_own" ON public.returns;
CREATE POLICY "returns_update_own" ON public.returns FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "returns_delete_own" ON public.returns;
CREATE POLICY "returns_delete_own" ON public.returns FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "return_items_select_own" ON public.return_items;
CREATE POLICY "return_items_select_own" ON public.return_items FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "return_items_insert_own" ON public.return_items;
CREATE POLICY "return_items_insert_own" ON public.return_items FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "return_items_update_own" ON public.return_items;
CREATE POLICY "return_items_update_own" ON public.return_items FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "return_items_delete_own" ON public.return_items;
CREATE POLICY "return_items_delete_own" ON public.return_items FOR DELETE USING (auth.uid() = user_id);

-- 5) updated_at trigger
DROP TRIGGER IF EXISTS trg_returns_updated_at ON public.returns;
CREATE TRIGGER trg_returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Independent numbering generator
CREATE OR REPLACE FUNCTION public.generate_return_number(_user_id UUID, _return_type public.return_type_enum)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  yr TEXT := to_char(CURRENT_DATE, 'YYYY');
  next_seq INT;
BEGIN
  prefix := CASE _return_type WHEN 'sales' THEN 'SR' ELSE 'PR' END;
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(return_number, '^' || prefix || '-' || yr || '-', ''), '') AS INT)
  ), 0) + 1
  INTO next_seq
  FROM public.returns
  WHERE user_id = _user_id
    AND return_type = _return_type
    AND return_number LIKE prefix || '-' || yr || '-%';
  RETURN prefix || '-' || yr || '-' || lpad(next_seq::TEXT, 4, '0');
END;
$$;

-- 7) Auto-assign return_number on insert
CREATE OR REPLACE FUNCTION public.set_return_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := public.generate_return_number(NEW.user_id, NEW.return_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_return_number ON public.returns;
CREATE TRIGGER trg_set_return_number
  BEFORE INSERT ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.set_return_number();

-- 8) Stock movement on confirm / unconfirm
CREATE OR REPLACE FUNCTION public.handle_returns_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  itm RECORD;
  delta NUMERIC;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
      FOR itm IN SELECT product_id, quantity FROM public.return_items WHERE return_id = NEW.id LOOP
        IF itm.product_id IS NOT NULL THEN
          delta := CASE NEW.return_type WHEN 'sales' THEN itm.quantity ELSE -itm.quantity END;
          UPDATE public.products
          SET current_stock = COALESCE(current_stock, 0) + delta
          WHERE id = itm.product_id;
        END IF;
      END LOOP;
    ELSIF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
      FOR itm IN SELECT product_id, quantity FROM public.return_items WHERE return_id = NEW.id LOOP
        IF itm.product_id IS NOT NULL THEN
          delta := CASE NEW.return_type WHEN 'sales' THEN -itm.quantity ELSE itm.quantity END;
          UPDATE public.products
          SET current_stock = COALESCE(current_stock, 0) + delta
          WHERE id = itm.product_id;
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_returns_stock ON public.returns;
CREATE TRIGGER trg_returns_stock
  AFTER UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.handle_returns_stock();

-- 9) Add return_id to transactions for full linkage
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS return_id UUID REFERENCES public.returns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_return ON public.transactions(return_id);

-- 10) Drop & recreate view with new columns
DROP VIEW IF EXISTS public.invoice_items_returnable;
CREATE VIEW public.invoice_items_returnable AS
SELECT
  ii.id AS invoice_item_id,
  ii.invoice_id,
  i.invoice_type,
  i.user_id,
  ii.product_id,
  ii.description,
  ii.quantity AS original_quantity,
  COALESCE((
    SELECT SUM(ri.quantity)
    FROM public.return_items ri
    JOIN public.returns r ON r.id = ri.return_id
    WHERE ri.source_invoice_item_id = ii.id
      AND r.status = 'confirmed'
      AND r.is_deleted = false
  ), 0) AS returned_quantity,
  GREATEST(
    ii.quantity - COALESCE((
      SELECT SUM(ri.quantity)
      FROM public.return_items ri
      JOIN public.returns r ON r.id = ri.return_id
      WHERE ri.source_invoice_item_id = ii.id
        AND r.status = 'confirmed'
        AND r.is_deleted = false
    ), 0),
    0
  ) AS remaining_returnable_quantity,
  ii.unit_price,
  ii.tax_rate
FROM public.invoice_items ii
JOIN public.invoices i ON i.id = ii.invoice_id;
