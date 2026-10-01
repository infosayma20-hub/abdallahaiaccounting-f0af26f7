CREATE OR REPLACE FUNCTION public.enforce_unique_product_barcode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_pid uuid; v_other text;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN v_code := nullif(trim(NEW.barcode),''); v_pid := NEW.id;
  ELSE v_code := nullif(trim(NEW.barcode),''); v_pid := NEW.product_id; END IF;
  IF v_code IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'products' THEN NEW.barcode := v_code; ELSE NEW.barcode := v_code; END IF;

  SELECT p.name INTO v_other FROM products p
   WHERE p.user_id = NEW.user_id AND p.id <> v_pid AND trim(p.barcode) = v_code LIMIT 1;
  IF v_other IS NULL THEN
    SELECT p.name INTO v_other FROM product_barcodes b JOIN products p ON p.id = b.product_id
     WHERE b.user_id = NEW.user_id AND b.product_id <> v_pid AND trim(b.barcode) = v_code LIMIT 1;
  END IF;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'الباركود % مستخدم لصنف آخر: %', v_code, v_other USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_unique_barcode_products ON public.products;
CREATE TRIGGER trg_unique_barcode_products BEFORE INSERT OR UPDATE OF barcode, user_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_product_barcode();

DROP TRIGGER IF EXISTS trg_unique_barcode_product_barcodes ON public.product_barcodes;
CREATE TRIGGER trg_unique_barcode_product_barcodes BEFORE INSERT OR UPDATE OF barcode, product_id, user_id ON public.product_barcodes
FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_product_barcode();

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_barcodes_user_barcode ON public.product_barcodes (user_id, barcode);