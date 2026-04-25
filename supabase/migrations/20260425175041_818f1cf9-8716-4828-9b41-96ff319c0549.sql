CREATE OR REPLACE FUNCTION public.handle_returns_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
          SET quantity = COALESCE(quantity, 0) + delta
          WHERE id = itm.product_id;
          -- Record stock movement for traceability (best-effort)
          BEGIN
            INSERT INTO public.stock_movements (
              user_id, product_id, movement_type, quantity, reference_type, reference_id,
              notes, movement_date
            ) VALUES (
              NEW.user_id, itm.product_id,
              CASE NEW.return_type WHEN 'sales' THEN 'in' ELSE 'out' END,
              ABS(itm.quantity),
              CASE NEW.return_type WHEN 'sales' THEN 'sales_return' ELSE 'purchase_return' END,
              NEW.id,
              'مردود ' || NEW.return_number,
              NEW.return_date
            );
          EXCEPTION WHEN OTHERS THEN
            -- ignore if stock_movements schema differs; stock already adjusted above
            NULL;
          END;
        END IF;
      END LOOP;
    ELSIF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
      FOR itm IN SELECT product_id, quantity FROM public.return_items WHERE return_id = NEW.id LOOP
        IF itm.product_id IS NOT NULL THEN
          delta := CASE NEW.return_type WHEN 'sales' THEN -itm.quantity ELSE itm.quantity END;
          UPDATE public.products
          SET quantity = COALESCE(quantity, 0) + delta
          WHERE id = itm.product_id;
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;