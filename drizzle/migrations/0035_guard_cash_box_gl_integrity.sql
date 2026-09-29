CREATE OR REPLACE FUNCTION public.guard_cash_box_gl_exists()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gl_account_code IS NOT NULL AND NEW.gl_account_code <> '' AND NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE user_id = NEW.user_id AND account_code = NEW.gl_account_code
  ) THEN
    RAISE EXCEPTION 'حساب الصندوق % غير موجود في دليل الحسابات', NEW.gl_account_code;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_cash_box_gl_exists
BEFORE INSERT OR UPDATE OF gl_account_code ON public.cash_boxes
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_box_gl_exists();

CREATE OR REPLACE FUNCTION public.guard_cash_movement_accounts_exist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.transaction_type IN ('currency_exchange','cash_transfer') THEN
    IF NEW.debit_account_code IS NOT NULL AND NEW.account_id_debit IS NULL THEN
      RAISE EXCEPTION 'الحساب المدين % غير موجود في دليل الحسابات', NEW.debit_account_code;
    END IF;
    IF NEW.credit_account_code IS NOT NULL AND NEW.account_id_credit IS NULL THEN
      RAISE EXCEPTION 'الحساب الدائن % غير موجود في دليل الحسابات', NEW.credit_account_code;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- name sorts after trg_resolve_account_ids so ids are already resolved
CREATE TRIGGER trg_zz_guard_cash_movement_accounts_exist
BEFORE INSERT OR UPDATE OF debit_account_code, credit_account_code ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_movement_accounts_exist();