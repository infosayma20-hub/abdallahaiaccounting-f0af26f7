
CREATE OR REPLACE FUNCTION public.autofill_call_center_visa_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gl text;
BEGIN
  IF NEW.payment_method = 'visa'
     AND (NEW.visa_gl_account_code IS NULL OR NEW.visa_gl_account_code = '')
     AND NEW.source_app IS NOT NULL
  THEN
    SELECT da.visa_gl_account_code
      INTO v_gl
    FROM public.delivery_apps da
    WHERE da.user_id = NEW.user_id
      AND da.is_active = true
      AND da.visa_gl_account_code IS NOT NULL
      AND lower(trim(da.name)) = lower(trim(NEW.source_app))
    LIMIT 1;

    IF v_gl IS NOT NULL THEN
      NEW.visa_gl_account_code := v_gl;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autofill_call_center_visa_gl ON public.call_center_orders;
CREATE TRIGGER trg_autofill_call_center_visa_gl
  BEFORE INSERT OR UPDATE OF payment_method, source_app, visa_gl_account_code
  ON public.call_center_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.autofill_call_center_visa_gl();
