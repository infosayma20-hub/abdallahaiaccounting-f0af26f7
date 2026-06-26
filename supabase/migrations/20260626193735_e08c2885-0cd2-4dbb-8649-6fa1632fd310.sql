
-- =========================================================
-- SPARTA PHASE 1 HARDENING — Shared tenancy + auto sync
-- =========================================================

-- 1) Canonical helpers --------------------------------------------------
CREATE OR REPLACE FUNCTION public.sparta_holding_id()
RETURNS uuid LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT '0a0655c6-b2b1-4607-a949-311cb8fb9f77'::uuid $$;

CREATE OR REPLACE FUNCTION public.sparta_owner_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT created_by FROM public.holdings WHERE id = public.sparta_holding_id() $$;

CREATE OR REPLACE FUNCTION public.is_sparta_holding_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.holding_members hm
    WHERE hm.auth_user_id = _user_id
      AND hm.holding_id   = public.sparta_holding_id()
      AND hm.role         = 'holding_admin'
  )
$$;

GRANT EXECUTE ON FUNCTION public.sparta_holding_id()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.sparta_owner_user_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sparta_holding_admin(uuid) TO authenticated;

-- 2) Data integrity check on batches -----------------------------------
ALTER TABLE public.product_batches
  DROP CONSTRAINT IF EXISTS product_batches_expiry_after_manufacture;
ALTER TABLE public.product_batches
  ADD CONSTRAINT product_batches_expiry_after_manufacture
  CHECK (
    expiry_date IS NULL OR manufacture_date IS NULL
    OR expiry_date >= manufacture_date
  );

-- 3) FIFO composite index ----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_product_batches_fifo
  ON public.product_batches (company_id, product_id, warehouse_id, status, expiry_date NULLS LAST, created_at);

-- 4) RLS: split read vs write on product_batches -----------------------
DROP POLICY IF EXISTS "sparta members manage batches" ON public.product_batches;

CREATE POLICY "sparta members read batches"
  ON public.product_batches FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()));

CREATE POLICY "sparta admins insert batches"
  ON public.product_batches FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()));

CREATE POLICY "sparta admins update batches"
  ON public.product_batches FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()))
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()));

CREATE POLICY "sparta admins delete batches"
  ON public.product_batches FOR DELETE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()));

-- 5) RLS: split read vs write on batch_movements -----------------------
DROP POLICY IF EXISTS "sparta members manage batch movements" ON public.batch_movements;

CREATE POLICY "sparta members read batch movements"
  ON public.batch_movements FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()));

CREATE POLICY "sparta admins insert batch movements"
  ON public.batch_movements FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_admin(auth.uid()));

-- (no UPDATE/DELETE for movements — they're an audit log)

-- 6) Auto-sync products.quantity from batch_movements ------------------
CREATE OR REPLACE FUNCTION public.sync_product_quantity_from_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _delta numeric;
BEGIN
  -- in  → +qty
  -- out → -qty
  -- adjustment → +qty (positive = add, caller must enter +)
  -- transfer   → 0 net (handled per side via two rows in/out)
  IF NEW.direction = 'in' OR NEW.direction = 'adjustment' THEN
    _delta := NEW.quantity;
  ELSIF NEW.direction = 'out' THEN
    _delta := - NEW.quantity;
  ELSE
    _delta := 0;
  END IF;

  IF _delta <> 0 THEN
    UPDATE public.products
       SET quantity = COALESCE(quantity, 0) + _delta,
           updated_at = now()
     WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_batch_movements_sync_qty ON public.batch_movements;
CREATE TRIGGER trg_batch_movements_sync_qty
  AFTER INSERT ON public.batch_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_quantity_from_batch();

-- 7) consume_batches_fifo now writes batch_movements itself
--    (atomic with quantity_remaining decrement) and the trigger above
--    automatically syncs products.quantity. We also tighten privileges
--    to sparta admins only.
CREATE OR REPLACE FUNCTION public.consume_batches_fifo(
  _company_id uuid, _product_id uuid, _warehouse_id uuid,
  _quantity numeric,
  _reference_type text DEFAULT NULL, _reference_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _remaining numeric := _quantity;
  _batch RECORD;
  _take numeric;
  _consumed jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: holding_admin required';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  FOR _batch IN
    SELECT id, batch_number, quantity_remaining, expiry_date
      FROM public.product_batches
     WHERE company_id = _company_id
       AND product_id = _product_id
       AND (_warehouse_id IS NULL OR warehouse_id = _warehouse_id)
       AND status = 'active'
       AND quantity_remaining > 0
     ORDER BY expiry_date NULLS LAST, created_at
     FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _take := LEAST(_batch.quantity_remaining, _remaining);

    UPDATE public.product_batches
       SET quantity_remaining = quantity_remaining - _take
     WHERE id = _batch.id;

    INSERT INTO public.batch_movements(
      company_id, batch_id, product_id, warehouse_id,
      quantity, direction, reference_type, reference_id, created_by
    ) VALUES (
      _company_id, _batch.id, _product_id, _warehouse_id,
      _take, 'out', _reference_type, _reference_id, auth.uid()
    );

    _consumed := _consumed || jsonb_build_object(
      'batch_id', _batch.id,
      'batch_number', _batch.batch_number,
      'taken', _take,
      'expiry_date', _batch.expiry_date
    );
    _remaining := _remaining - _take;
  END LOOP;

  IF _remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: short by %', _remaining;
  END IF;

  RETURN jsonb_build_object('consumed', _consumed, 'total', _quantity);
END $$;

GRANT EXECUTE ON FUNCTION public.consume_batches_fifo(uuid,uuid,uuid,numeric,text,uuid)
  TO authenticated;

-- 8) Backfill: claim any pre-existing sparta-tagged rows under the
--    canonical holding owner so the new tenancy applies uniformly.
UPDATE public.products
   SET user_id = public.sparta_owner_user_id()
 WHERE id IN (
   SELECT DISTINCT product_id FROM public.product_batches
    WHERE company_id = public.sparta_holding_id()
 )
   AND user_id <> public.sparta_owner_user_id();

UPDATE public.warehouses
   SET user_id = public.sparta_owner_user_id()
 WHERE id IN (
   SELECT DISTINCT warehouse_id FROM public.product_batches
    WHERE company_id = public.sparta_holding_id() AND warehouse_id IS NOT NULL
 )
   AND user_id <> public.sparta_owner_user_id();
