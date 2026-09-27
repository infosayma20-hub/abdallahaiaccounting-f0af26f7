
CREATE OR REPLACE FUNCTION public.procurement_item_sync_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid; v_cnt int; v_cat text;
BEGIN
  SELECT name INTO v_cat FROM public.item_categories WHERE id = NEW.category_id;
  v_cat := coalesce(v_cat, 'بضاعة عامة');
  IF NEW.inventory_product_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.inventory_product_id) THEN
    SELECT count(*), min(id::text)::uuid INTO v_cnt, v_pid FROM public.products WHERE user_id = NEW.user_id AND name = NEW.name;
    IF v_cnt <> 1 THEN
      INSERT INTO public.products(user_id, name, unit, buy_price, sell_price, quantity, min_quantity, category, is_pos_available, is_purchased)
      VALUES (NEW.user_id, NEW.name, NEW.unit, coalesce(NEW.default_price,0), 0, 0, 0, v_cat, false, true)
      RETURNING id INTO v_pid;
    END IF;
    NEW.inventory_product_id := v_pid;
  ELSIF TG_OP = 'UPDATE' AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    UPDATE public.products SET name = NEW.name, unit = NEW.unit, category = v_cat, updated_at = now()
    WHERE id = NEW.inventory_product_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_procurement_item_sync_product ON public.procurement_items;
CREATE TRIGGER trg_procurement_item_sync_product
BEFORE INSERT OR UPDATE OF name, unit, category_id, inventory_product_id ON public.procurement_items
FOR EACH ROW EXECUTE FUNCTION public.procurement_item_sync_product();

CREATE OR REPLACE FUNCTION public.item_category_sync_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.products p SET category = NEW.name, updated_at = now()
    FROM public.procurement_items pi
    WHERE pi.category_id = NEW.id AND pi.inventory_product_id = p.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_item_category_sync_products ON public.item_categories;
CREATE TRIGGER trg_item_category_sync_products
AFTER UPDATE OF name ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.item_category_sync_products();

-- Non-destructive backfill: link only unique exact-name matches (no new rows)
UPDATE public.procurement_items pi SET inventory_product_id = m.pid
FROM (
  SELECT pi2.id, min(p.id::text)::uuid pid FROM public.procurement_items pi2
  JOIN public.products p ON p.user_id = pi2.user_id AND p.name = pi2.name
  WHERE pi2.inventory_product_id IS NULL
  GROUP BY pi2.id HAVING count(*) = 1
) m WHERE pi.id = m.id;
