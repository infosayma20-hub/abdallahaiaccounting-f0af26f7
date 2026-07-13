
-- Phase 3: Currency integrity guard trigger on transactions
-- Non-destructive: only validates NEW writes with foreign currency;
-- ignores legacy rows and ILS-only rows.

CREATE OR REPLACE FUNCTION public.validate_transaction_currency_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_currency TEXT;
  v_is_foreign BOOLEAN;
  v_expected NUMERIC;
  v_tolerance NUMERIC;
BEGIN
  -- Normalize currency
  v_currency := COALESCE(NEW.currency, 'شيكل');

  -- Local currency: no validation (allow null foreign_amount/exchange_rate)
  IF v_currency IN ('شيكل', 'ILS', '') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: skip if none of the currency-related fields changed
  -- (protects legacy rows from being rejected on unrelated updates)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.foreign_amount IS NOT DISTINCT FROM OLD.foreign_amount
       AND NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
    THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Foreign currency: must have foreign_amount + exchange_rate
  IF NEW.foreign_amount IS NULL OR NEW.foreign_amount <= 0 THEN
    RAISE EXCEPTION 'currency_integrity: العملة الأجنبية (%) تتطلب قيمة أجنبية (foreign_amount) موجبة. المبلغ الشيكلي=%',
      v_currency, NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate <= 0 THEN
    RAISE EXCEPTION 'currency_integrity: العملة الأجنبية (%) تتطلب سعر صرف موجب (exchange_rate). foreign_amount=%',
      v_currency, NEW.foreign_amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- Math consistency: amount ≈ foreign_amount * exchange_rate
  v_expected := NEW.foreign_amount * NEW.exchange_rate;
  v_tolerance := GREATEST(0.01, ABS(v_expected) * 0.01);
  IF ABS(COALESCE(NEW.amount,0) - v_expected) > v_tolerance THEN
    RAISE EXCEPTION 'currency_integrity: عدم تطابق حسابي. المبلغ الشيكلي (%) ≠ القيمة الأجنبية (%) × سعر الصرف (%) = %. العملة=%',
      NEW.amount, NEW.foreign_amount, NEW.exchange_rate, v_expected, v_currency
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_transaction_currency_integrity() IS
'Phase 3 currency guard: prevents inserting/updating transactions with foreign currency but missing/invalid foreign_amount, exchange_rate, or ILS math mismatch. Legacy rows are protected — trigger skips UPDATEs that do not touch currency fields, and never fires on ILS-only rows.';

DROP TRIGGER IF EXISTS trg_validate_transaction_currency_integrity ON public.transactions;
CREATE TRIGGER trg_validate_transaction_currency_integrity
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_transaction_currency_integrity();
