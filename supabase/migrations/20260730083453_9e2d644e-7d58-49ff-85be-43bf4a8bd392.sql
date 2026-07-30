CREATE OR REPLACE FUNCTION public.resolve_account_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.debit_account_code IS NULL OR btrim(NEW.debit_account_code) = '' THEN
    RAISE EXCEPTION 'ACCOUNT_CODE_REQUIRED: حساب المدين مطلوب';
  END IF;

  SELECT id INTO NEW.account_id_debit
  FROM public.accounts
  WHERE user_id = NEW.user_id
    AND account_code = NEW.debit_account_code;

  IF NEW.account_id_debit IS NULL THEN
    RAISE EXCEPTION 'DEBIT_ACCOUNT_NOT_FOUND: حساب المدين % غير موجود لنفس المشترك', NEW.debit_account_code;
  END IF;

  IF NEW.credit_account_code IS NULL OR btrim(NEW.credit_account_code) = '' THEN
    RAISE EXCEPTION 'ACCOUNT_CODE_REQUIRED: حساب الدائن مطلوب';
  END IF;

  SELECT id INTO NEW.account_id_credit
  FROM public.accounts
  WHERE user_id = NEW.user_id
    AND account_code = NEW.credit_account_code;

  IF NEW.account_id_credit IS NULL THEN
    RAISE EXCEPTION 'CREDIT_ACCOUNT_NOT_FOUND: حساب الدائن % غير موجود لنفس المشترك', NEW.credit_account_code;
  END IF;

  RETURN NEW;
END;
$$;