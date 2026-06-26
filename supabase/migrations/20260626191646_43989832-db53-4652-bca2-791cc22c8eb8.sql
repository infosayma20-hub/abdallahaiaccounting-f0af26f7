
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_batch_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_shelf_life_days integer;

CREATE OR REPLACE FUNCTION public.is_sparta_holding_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.holding_members hm
    WHERE hm.auth_user_id = _user_id
      AND hm.holding_id = '0a0655c6-b2b1-4607-a949-311cb8fb9f77'::uuid
  );
$$;

CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  batch_number text NOT NULL,
  lot_number text,
  manufacture_date date,
  expiry_date date,
  quantity_in numeric NOT NULL DEFAULT 0 CHECK (quantity_in >= 0),
  quantity_remaining numeric NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  supplier_id uuid,
  purchase_invoice_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','recalled','depleted')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id, batch_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta members manage batches" ON public.product_batches FOR ALL TO authenticated
USING (public.is_sparta_holding_member(auth.uid()))
WITH CHECK (public.is_sparta_holding_member(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_product_batches_product ON public.product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_company ON public.product_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(expiry_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse ON public.product_batches(warehouse_id);

CREATE TABLE IF NOT EXISTS public.batch_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE RESTRICT,
  stock_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid,
  quantity numeric NOT NULL CHECK (quantity > 0),
  direction text NOT NULL CHECK (direction IN ('in','out','transfer','adjustment')),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_movements TO authenticated;
GRANT ALL ON public.batch_movements TO service_role;
ALTER TABLE public.batch_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta members manage batch movements" ON public.batch_movements FOR ALL TO authenticated
USING (public.is_sparta_holding_member(auth.uid()))
WITH CHECK (public.is_sparta_holding_member(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_batch_movements_batch ON public.batch_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_product ON public.batch_movements(product_id);

CREATE OR REPLACE FUNCTION public.sparta_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_product_batches_touch ON public.product_batches;
CREATE TRIGGER trg_product_batches_touch
BEFORE UPDATE ON public.product_batches
FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at();

CREATE OR REPLACE FUNCTION public.update_batch_status()
RETURNS TRIGGER LANGUAGE plpgsql 
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity_remaining <= 0 THEN
    NEW.status := 'depleted';
  ELSIF NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_product_batches_status ON public.product_batches;
CREATE TRIGGER trg_product_batches_status
BEFORE INSERT OR UPDATE ON public.product_batches
FOR EACH ROW EXECUTE FUNCTION public.update_batch_status();

CREATE OR REPLACE FUNCTION public.consume_batches_fifo(
  _company_id uuid,
  _product_id uuid,
  _warehouse_id uuid,
  _quantity numeric,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _remaining numeric := _quantity;
  _batch RECORD;
  _take numeric;
  _consumed jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_sparta_holding_member(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR _batch IN
    SELECT id, batch_number, quantity_remaining, expiry_date
    FROM public.product_batches
    WHERE company_id = _company_id
      AND product_id = _product_id
      AND (warehouse_id = _warehouse_id OR _warehouse_id IS NULL)
      AND status = 'active'
      AND quantity_remaining > 0
    ORDER BY expiry_date NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _take := LEAST(_batch.quantity_remaining, _remaining);

    UPDATE public.product_batches
      SET quantity_remaining = quantity_remaining - _take
      WHERE id = _batch.id;

    INSERT INTO public.batch_movements
      (company_id, batch_id, product_id, warehouse_id, quantity, direction, reference_type, reference_id, created_by)
    VALUES
      (_company_id, _batch.id, _product_id, _warehouse_id, _take, 'out', _reference_type, _reference_id, auth.uid());

    _consumed := _consumed || jsonb_build_object('batch_id', _batch.id, 'batch_number', _batch.batch_number, 'quantity', _take);
    _remaining := _remaining - _take;
  END LOOP;

  IF _remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient batch stock: short by %', _remaining;
  END IF;

  RETURN jsonb_build_object('success', true, 'consumed', _consumed);
END $$;

GRANT EXECUTE ON FUNCTION public.consume_batches_fifo(uuid,uuid,uuid,numeric,text,uuid) TO authenticated;
