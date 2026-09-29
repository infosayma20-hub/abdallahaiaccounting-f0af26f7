-- Root cause: two triggers fired handle_returns_stock on the same status change (double quantity),
-- and its stock_movements insert used invalid values ('in'/'out', movement_date) and failed silently.
DROP TRIGGER IF EXISTS trg_returns_stock ON public.returns;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_mvt_return_line
  ON public.stock_movements (reference_type, reference_line_id)
  WHERE reference_type IN ('sales_return','purchase_return','sales_return_cancel','purchase_return_cancel')
    AND reference_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_returns_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  itm RECORD;
  v_in boolean;
  v_ref text;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    v_in := NEW.return_type = 'sales';
    v_ref := CASE NEW.return_type WHEN 'sales' THEN 'sales_return' ELSE 'purchase_return' END;
  ELSIF OLD.status = 'confirmed' AND NEW.status IS DISTINCT FROM 'confirmed' THEN
    v_in := NEW.return_type <> 'sales';
    v_ref := CASE NEW.return_type WHEN 'sales' THEN 'sales_return_cancel' ELSE 'purchase_return_cancel' END;
  ELSE
    RETURN NEW;
  END IF;

  -- Single writer: the stock movement; products.quantity and warehouse balances follow via stock_movements triggers.
  FOR itm IN SELECT id, product_id, quantity FROM public.return_items
             WHERE return_id = NEW.id AND product_id IS NOT NULL AND COALESCE(quantity,0) <> 0 LOOP
    INSERT INTO public.stock_movements (
      user_id, product_id, movement_type, quantity, reference_type, reference_id, reference_line_id, reference_note, created_at
    ) VALUES (
      NEW.user_id, itm.product_id,
      (CASE WHEN v_in THEN 'وارد' ELSE 'صادر' END)::stock_movement_type,
      ABS(itm.quantity), v_ref, NEW.id, itm.id,
      CASE WHEN v_ref LIKE '%_cancel' THEN 'إلغاء ' ELSE '' END
        || CASE NEW.return_type WHEN 'sales' THEN 'مردود مبيعات ' ELSE 'مردود مشتريات ' END
        || COALESCE(NEW.return_number,''),
      now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END $$;