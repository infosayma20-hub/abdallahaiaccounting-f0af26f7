-- Fiscal Period Lock — Phase 1.1
-- Extend check_fiscal_period_open() to cover DELETE in addition to INSERT/UPDATE.
-- Without this, edit-flows that delete-then-recreate transactions can lose
-- the original journal when the recreate is blocked by the lock.

CREATE OR REPLACE FUNCTION public.check_fiscal_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period RECORD;
  v_date   date;
  v_uid    uuid;
BEGIN
  -- Use NEW on INSERT/UPDATE, OLD on DELETE
  v_date := COALESCE(NEW.transaction_date, OLD.transaction_date);
  v_uid  := COALESCE(NEW.user_id, OLD.user_id);

  IF v_date IS NULL OR v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id, period_name, status INTO v_period
  FROM public.fiscal_periods
  WHERE user_id = v_uid
    AND v_date >= start_date
    AND v_date <= end_date
    AND status IN ('closed', 'locked')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'الفترة المحاسبية "%" مغلقة. لا يمكن إدخال أو تعديل أو حذف قيود بتاريخ %',
      v_period.period_name, v_date;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Recreate the trigger so DELETE is now covered too
DROP TRIGGER IF EXISTS trg_check_fiscal_period ON public.transactions;
CREATE TRIGGER trg_check_fiscal_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_fiscal_period_open();