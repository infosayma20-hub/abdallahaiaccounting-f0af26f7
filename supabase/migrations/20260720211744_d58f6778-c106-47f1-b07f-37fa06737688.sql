
-- Phase 3: Foreign-currency ILS equivalence on pos_payments (additive)

ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS tendered_ils numeric,
  ADD COLUMN IF NOT EXISTS fx_rate numeric;

COMMENT ON COLUMN public.pos_payments.tendered_ils IS
  'Amount tendered converted to ILS using fx_rate at time of payment. Additive column; NULL means legacy row without deterministic conversion.';
COMMENT ON COLUMN public.pos_payments.fx_rate IS
  'Actual FX rate (foreign currency -> ILS) captured at time of payment. Additive column.';

-- Auto-fill trigger: only populates when values are NULL to avoid overwriting anything explicit.
CREATE OR REPLACE FUNCTION public.pos_payments_fill_ils()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_curr text := UPPER(COALESCE(NEW.currency, 'ILS'));
  v_rate numeric;
  v_base numeric;
BEGIN
  -- Determine fx_rate if not provided
  IF NEW.fx_rate IS NULL THEN
    IF v_curr = 'ILS' THEN
      v_rate := 1;
    ELSIF NEW.exchange_rate IS NOT NULL AND NEW.exchange_rate <> 0 THEN
      v_rate := NEW.exchange_rate;
    ELSE
      v_rate := NULL;
    END IF;
    NEW.fx_rate := v_rate;
  ELSE
    v_rate := NEW.fx_rate;
  END IF;

  -- Determine ILS equivalent if not provided
  IF NEW.tendered_ils IS NULL THEN
    v_base := COALESCE(NEW.tendered, NEW.amount);
    IF v_curr = 'ILS' THEN
      NEW.tendered_ils := v_base;
    ELSIF v_rate IS NOT NULL AND v_base IS NOT NULL THEN
      NEW.tendered_ils := v_base * v_rate;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_payments_fill_ils ON public.pos_payments;
CREATE TRIGGER trg_pos_payments_fill_ils
BEFORE INSERT OR UPDATE OF amount, tendered, currency, exchange_rate, fx_rate, tendered_ils
ON public.pos_payments
FOR EACH ROW EXECUTE FUNCTION public.pos_payments_fill_ils();

-- Safe deterministic backfill for existing rows only (never overwrite non-null values).
-- Case A: ILS rows -> rate 1, ils = amount
UPDATE public.pos_payments
   SET fx_rate = 1,
       tendered_ils = COALESCE(tendered_ils, amount)
 WHERE fx_rate IS NULL
   AND UPPER(COALESCE(currency, 'ILS')) = 'ILS';

-- Case B: Foreign rows with known exchange_rate -> compute ILS from tendered (or amount as fallback)
UPDATE public.pos_payments
   SET fx_rate = exchange_rate,
       tendered_ils = COALESCE(tendered_ils, COALESCE(tendered, amount) * exchange_rate)
 WHERE fx_rate IS NULL
   AND UPPER(COALESCE(currency, 'ILS')) <> 'ILS'
   AND exchange_rate IS NOT NULL
   AND exchange_rate <> 0;

-- Helpful index for shift math that will filter by ILS values later
CREATE INDEX IF NOT EXISTS idx_pos_payments_order_method_ils
  ON public.pos_payments(order_id, payment_method)
  WHERE tendered_ils IS NOT NULL;
