CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_items_inventory_product
  ON public.procurement_items(inventory_product_id) WHERE inventory_product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_product_to_procurement_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_id FROM procurement_items WHERE inventory_product_id = NEW.id;
  IF v_id IS NULL AND COALESCE(NEW.is_purchased, false) THEN
    SELECT id INTO v_id FROM procurement_items
     WHERE user_id = NEW.user_id AND inventory_product_id IS NULL AND lower(trim(name)) = lower(trim(NEW.name))
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE procurement_items SET inventory_product_id = NEW.id WHERE id = v_id;
    END IF;
  END IF;

  IF COALESCE(NEW.is_purchased, false) THEN
    IF v_id IS NULL THEN
      INSERT INTO procurement_items(user_id, name, unit, default_price, is_active, inventory_product_id)
      VALUES (NEW.user_id, NEW.name, COALESCE(NULLIF(NEW.unit,''),'قطعة'), COALESCE(NEW.buy_price,0), true, NEW.id);
    ELSE
      UPDATE procurement_items SET name = NEW.name,
        unit = COALESCE(NULLIF(NEW.unit,''), unit),
        default_price = COALESCE(NEW.buy_price, default_price),
        is_active = true
      WHERE id = v_id;
    END IF;
  ELSIF v_id IS NOT NULL THEN
    UPDATE procurement_items SET is_active = false WHERE id = v_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_product_to_procurement_item ON public.products;
CREATE TRIGGER trg_sync_product_to_procurement_item
AFTER INSERT OR UPDATE OF is_purchased, name, unit, buy_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_to_procurement_item();

UPDATE public.procurement_items pi SET inventory_product_id = p.id
FROM public.products p
WHERE pi.inventory_product_id IS NULL AND p.is_purchased AND pi.user_id = p.user_id
  AND lower(trim(pi.name)) = lower(trim(p.name))
  AND NOT EXISTS (SELECT 1 FROM public.procurement_items x WHERE x.inventory_product_id = p.id)
  AND (SELECT count(*) FROM public.products p2 WHERE p2.user_id = p.user_id AND lower(trim(p2.name)) = lower(trim(p.name))) = 1
  AND (SELECT count(*) FROM public.procurement_items y WHERE y.user_id = pi.user_id AND y.inventory_product_id IS NULL AND lower(trim(y.name)) = lower(trim(pi.name))) = 1;

INSERT INTO public.procurement_items(user_id, name, unit, default_price, is_active, inventory_product_id)
SELECT p.user_id, p.name, COALESCE(NULLIF(p.unit,''),'قطعة'), COALESCE(p.buy_price,0), true, p.id
FROM public.products p
WHERE p.is_purchased AND p.name IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
  AND NOT EXISTS (SELECT 1 FROM public.procurement_items x WHERE x.inventory_product_id = p.id);