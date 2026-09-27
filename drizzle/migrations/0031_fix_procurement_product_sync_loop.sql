CREATE OR REPLACE FUNCTION public.procurement_item_sync_product()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_cnt int; v_cat text;
BEGIN
  IF current_setting('app.proc_sync_active', true) = 'on' THEN RETURN NEW; END IF;
  SELECT name INTO v_cat FROM public.item_categories WHERE id = NEW.category_id;
  v_cat := coalesce(v_cat, 'بضاعة عامة');
  PERFORM set_config('app.proc_sync_active', 'on', true);
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
  PERFORM set_config('app.proc_sync_active', 'off', true);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sync_product_to_procurement_item()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF current_setting('app.proc_sync_active', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('app.proc_sync_active', 'on', true);
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
  PERFORM set_config('app.proc_sync_active', 'off', true);
  RETURN NEW;
END $function$;