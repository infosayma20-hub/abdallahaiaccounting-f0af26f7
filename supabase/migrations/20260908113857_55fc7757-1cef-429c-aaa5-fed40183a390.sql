-- 1) Real balances table
CREATE TABLE IF NOT EXISTS public.product_warehouse_balances (
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  movement_count integer NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);

GRANT SELECT ON public.product_warehouse_balances TO authenticated;
GRANT ALL ON public.product_warehouse_balances TO service_role;

ALTER TABLE public.product_warehouse_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwb_select_own" ON public.product_warehouse_balances
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR user_id = public.get_team_owner_id());

CREATE INDEX IF NOT EXISTS idx_pwb_user_wh ON public.product_warehouse_balances (user_id, warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS idx_pwb_user_product ON public.product_warehouse_balances (user_id, product_id);

-- 2) Signed delta helper
CREATE OR REPLACE FUNCTION public.stock_movement_signed_qty(_type public.stock_movement_type, _qty numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _type = 'وارد'::public.stock_movement_type THEN COALESCE(_qty, 0)
    WHEN _type = 'صادر'::public.stock_movement_type THEN -COALESCE(_qty, 0)
    WHEN _type = 'تعديل يدوي'::public.stock_movement_type THEN COALESCE(_qty, 0)
    ELSE 0
  END
$$;

-- 3) Incremental maintenance trigger
CREATE OR REPLACE FUNCTION public.tg_maintain_product_warehouse_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_wh uuid;
  v_new_wh uuid;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.product_id IS NOT NULL THEN
    v_old_wh := COALESCE(OLD.warehouse_id, (SELECT w.id FROM public.warehouses w WHERE w.user_id = OLD.user_id AND w.is_default LIMIT 1));
    IF v_old_wh IS NOT NULL THEN
      UPDATE public.product_warehouse_balances b
         SET quantity_on_hand = b.quantity_on_hand - public.stock_movement_signed_qty(OLD.movement_type, OLD.quantity),
             movement_count = GREATEST(b.movement_count - 1, 0),
             updated_at = now()
       WHERE b.product_id = OLD.product_id AND b.warehouse_id = v_old_wh;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.product_id IS NOT NULL THEN
    v_new_wh := COALESCE(NEW.warehouse_id, (SELECT w.id FROM public.warehouses w WHERE w.user_id = NEW.user_id AND w.is_default LIMIT 1));
    IF v_new_wh IS NOT NULL THEN
      INSERT INTO public.product_warehouse_balances AS b
        (user_id, product_id, warehouse_id, quantity_on_hand, movement_count, last_movement_at, updated_at)
      VALUES
        (NEW.user_id, NEW.product_id, v_new_wh,
         public.stock_movement_signed_qty(NEW.movement_type, NEW.quantity),
         1, NEW.created_at, now())
      ON CONFLICT (product_id, warehouse_id) DO UPDATE
        SET quantity_on_hand = b.quantity_on_hand + public.stock_movement_signed_qty(NEW.movement_type, NEW.quantity),
            movement_count = b.movement_count + 1,
            last_movement_at = GREATEST(COALESCE(b.last_movement_at, NEW.created_at), NEW.created_at),
            user_id = NEW.user_id,
            updated_at = now();
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_z_maintain_pw_balance ON public.stock_movements;
CREATE TRIGGER trg_z_maintain_pw_balance
AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.tg_maintain_product_warehouse_balance();

-- 4) Full rebuild function (self-healing / verification)
CREATE OR REPLACE FUNCTION public.rebuild_product_warehouse_balances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.product_warehouse_balances;

  INSERT INTO public.product_warehouse_balances
    (user_id, product_id, warehouse_id, quantity_on_hand, movement_count, last_movement_at, updated_at)
  SELECT sm.user_id,
         sm.product_id,
         COALESCE(sm.warehouse_id, dw.id) AS warehouse_id,
         COALESCE(SUM(public.stock_movement_signed_qty(sm.movement_type, sm.quantity)), 0),
         COUNT(sm.id),
         MAX(sm.created_at),
         now()
    FROM public.stock_movements sm
    LEFT JOIN LATERAL (
      SELECT w2.id FROM public.warehouses w2
       WHERE w2.user_id = sm.user_id AND w2.is_default LIMIT 1
    ) dw ON sm.warehouse_id IS NULL
   WHERE sm.product_id IS NOT NULL
     AND COALESCE(sm.warehouse_id, dw.id) IS NOT NULL
   GROUP BY sm.user_id, sm.product_id, COALESCE(sm.warehouse_id, dw.id);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_product_warehouse_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_product_warehouse_balances() TO service_role;

-- 5) Initial fill
SELECT public.rebuild_product_warehouse_balances();

-- 6) Repoint the existing view to the balances table (same columns, same semantics)
CREATE OR REPLACE VIEW public.product_warehouse_stock AS
SELECT b.user_id,
       b.product_id,
       p.name AS product_name,
       p.unit,
       b.warehouse_id,
       w.name AS warehouse_name,
       w.warehouse_type,
       w.sales_rep_id,
       b.quantity_on_hand,
       b.movement_count::bigint AS movement_count,
       b.last_movement_at
  FROM public.product_warehouse_balances b
  JOIN public.products p ON p.id = b.product_id AND p.user_id = b.user_id
  JOIN public.warehouses w ON w.id = b.warehouse_id AND w.user_id = b.user_id;
