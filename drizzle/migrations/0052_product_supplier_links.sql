CREATE TABLE IF NOT EXISTS public.product_supplier_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.pos_suppliers(id) ON DELETE CASCADE,
  first_order_date date,
  last_order_date date,
  last_unit_price numeric DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  total_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id)
);
GRANT SELECT ON public.product_supplier_links TO authenticated;
GRANT ALL ON public.product_supplier_links TO service_role;
ALTER TABLE public.product_supplier_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads product supplier links" ON public.product_supplier_links FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));
CREATE INDEX IF NOT EXISTS idx_psl_supplier ON public.product_supplier_links(supplier_id);

-- Recompute one (product, supplier) link from non-cancelled orders (idempotent, safe to re-run)
CREATE OR REPLACE FUNCTION public.refresh_product_supplier_link(p_product uuid, p_supplier uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF p_product IS NULL OR p_supplier IS NULL THEN RETURN; END IF;
  SELECT min(o.order_date) f, max(o.order_date) l, count(DISTINCT o.id) c, coalesce(sum(oi.quantity),0) q,
         (array_agg(oi.unit_price ORDER BY o.order_date DESC, o.created_at DESC))[1] p, min(o.user_id::text)::uuid u
  INTO r
  FROM procurement_order_items oi
  JOIN procurement_orders o ON o.id = oi.order_id
  JOIN procurement_items pi ON pi.id = oi.product_id
  WHERE pi.inventory_product_id = p_product AND o.supplier_id = p_supplier AND coalesce(o.status,'') <> 'cancelled';
  IF coalesce(r.c,0) = 0 THEN
    DELETE FROM product_supplier_links WHERE product_id = p_product AND supplier_id = p_supplier;
  ELSE
    INSERT INTO product_supplier_links(user_id, product_id, supplier_id, first_order_date, last_order_date, last_unit_price, orders_count, total_qty)
    VALUES (r.u, p_product, p_supplier, r.f, r.l, coalesce(r.p,0), r.c, r.q)
    ON CONFLICT (product_id, supplier_id) DO UPDATE SET first_order_date=EXCLUDED.first_order_date, last_order_date=EXCLUDED.last_order_date,
      last_unit_price=EXCLUDED.last_unit_price, orders_count=EXCLUDED.orders_count, total_qty=EXCLUDED.total_qty, updated_at=now();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.refresh_product_supplier_link(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_poi_product_supplier_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod uuid; v_sup uuid; v_row record;
BEGIN
  FOR v_row IN SELECT * FROM (SELECT NEW.product_id pid, NEW.order_id oid WHERE TG_OP <> 'DELETE'
                              UNION SELECT OLD.product_id, OLD.order_id WHERE TG_OP <> 'INSERT') s LOOP
    SELECT inventory_product_id INTO v_prod FROM procurement_items WHERE id = v_row.pid;
    SELECT supplier_id INTO v_sup FROM procurement_orders WHERE id = v_row.oid;
    PERFORM refresh_product_supplier_link(v_prod, v_sup);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS poi_product_supplier_link ON public.procurement_order_items;
CREATE TRIGGER poi_product_supplier_link AFTER INSERT OR UPDATE OR DELETE ON public.procurement_order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_poi_product_supplier_link();

CREATE OR REPLACE FUNCTION public.trg_po_product_supplier_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod uuid;
BEGIN
  IF NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.order_date IS NOT DISTINCT FROM OLD.order_date THEN RETURN NULL; END IF;
  FOR v_prod IN SELECT DISTINCT pi.inventory_product_id FROM procurement_order_items oi JOIN procurement_items pi ON pi.id = oi.product_id
                WHERE oi.order_id = NEW.id AND pi.inventory_product_id IS NOT NULL LOOP
    PERFORM refresh_product_supplier_link(v_prod, NEW.supplier_id);
    IF OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN PERFORM refresh_product_supplier_link(v_prod, OLD.supplier_id); END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS po_product_supplier_link ON public.procurement_orders;
CREATE TRIGGER po_product_supplier_link AFTER UPDATE ON public.procurement_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_po_product_supplier_link();

-- Backfill from existing orders
DO $$ DECLARE x record; BEGIN
  FOR x IN SELECT DISTINCT pi.inventory_product_id p, o.supplier_id s FROM procurement_order_items oi
    JOIN procurement_orders o ON o.id = oi.order_id JOIN procurement_items pi ON pi.id = oi.product_id
    WHERE pi.inventory_product_id IS NOT NULL AND o.supplier_id IS NOT NULL LOOP
    PERFORM public.refresh_product_supplier_link(x.p, x.s);
  END LOOP;
END $$;