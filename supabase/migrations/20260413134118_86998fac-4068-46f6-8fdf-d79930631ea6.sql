
-- ============================================
-- ① MERGE: pos_orders BEFORE INSERT (2 → 1)
-- ============================================

-- Create merged function
CREATE OR REPLACE FUNCTION public.pos_order_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_cutoff_hour INTEGER := 6;
  v_business_date DATE;
  v_daily_count INTEGER;
  v_queue INTEGER;
  v_seed INTEGER;
BEGIN
  -- Calculate business date
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  -- Count today's orders for this user
  SELECT COUNT(*) + 1 INTO v_daily_count
  FROM public.pos_orders
  WHERE user_id = NEW.user_id
    AND created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
    AND created_at < (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron';

  -- === Order number (from generate_pos_order_number) ===
  NEW.order_number := 'POS-' || to_char(v_business_date, 'YYYYMMDD') || '-' || LPAD(v_daily_count::TEXT, 4, '0');

  -- === Display number (from generate_pos_display_numbers) ===
  v_queue := ((v_daily_count - 1) % 50) + 1;
  v_seed := (v_daily_count * 7 + EXTRACT(DOY FROM v_business_date)::INTEGER * 3 + 137) % 9000 + 1000;
  NEW.display_number := '#' || v_seed::TEXT;
  NEW.queue_number := v_queue;

  RETURN NEW;
END;
$$;

-- Drop old triggers
DROP TRIGGER IF EXISTS trg_generate_pos_order_number ON public.pos_orders;
DROP TRIGGER IF EXISTS trg_generate_pos_display_numbers ON public.pos_orders;

-- Create single merged trigger
CREATE TRIGGER trg_pos_order_before_insert
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_order_before_insert();


-- ============================================
-- ② MERGE: pos_orders AFTER UPDATE (2 → 1)
-- ============================================

-- Create merged function
CREATE OR REPLACE FUNCTION public.pos_order_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- === Cancel cascade (from cascade_transaction_from_pos) ===
  IF NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id AND is_deleted = false;
    END IF;

    UPDATE public.transactions
    SET is_deleted = true
    WHERE idempotency_key = 'COGS-' || NEW.id::text AND is_deleted = false;

    UPDATE public.products p
    SET quantity = p.quantity + ol.qty
    FROM public.pos_order_lines ol
    WHERE ol.order_id = NEW.id AND ol.product_id = p.id;
  END IF;

  -- === Table status (from update_table_status_on_order) ===
  IF NEW.table_id IS NOT NULL THEN
    IF NEW.state = 'paid' AND OLD.state != 'paid' THEN
      UPDATE public.restaurant_tables SET
        status = 'available', current_order_id = NULL,
        current_guests = 0, occupied_at = NULL, updated_at = NOW()
      WHERE id = NEW.table_id;
    END IF;

    IF NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
      UPDATE public.restaurant_tables SET
        status = 'available', current_order_id = NULL,
        current_guests = 0, occupied_at = NULL, updated_at = NOW()
      WHERE id = NEW.table_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old triggers
DROP TRIGGER IF EXISTS trg_pos_order_cancel_cascade ON public.pos_orders;
DROP TRIGGER IF EXISTS trg_pos_order_table_update ON public.pos_orders;

-- Create single merged trigger
CREATE TRIGGER trg_pos_order_after_update
  AFTER UPDATE ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_order_after_update();
