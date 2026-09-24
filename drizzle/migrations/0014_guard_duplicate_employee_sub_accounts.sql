CREATE OR REPLACE FUNCTION public.guard_employee_sub_account_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_emp uuid; v_existing text;
BEGIN
  IF NEW.parent_code IS DISTINCT FROM '2180' THEN RETURN NEW; END IF;

  IF NEW.employee_id IS NULL THEN
    SELECT e.id INTO v_emp FROM public.employees e
     WHERE e.user_id = NEW.user_id
       AND regexp_replace(trim(e.full_name), '\s+', ' ', 'g')
         = regexp_replace(trim(regexp_replace(COALESCE(NEW.account_name,''), '^ذمم موظف\s*-\s*', '')), '\s+', ' ', 'g')
     LIMIT 1;
    IF v_emp IS NOT NULL THEN NEW.employee_id := v_emp; END IF;
  END IF;

  IF NEW.employee_id IS NOT NULL AND COALESCE(NEW.is_active, true) THEN
    SELECT a.account_code INTO v_existing FROM public.accounts a
     WHERE a.user_id = NEW.user_id AND a.employee_id = NEW.employee_id
       AND COALESCE(a.is_active, true) AND a.account_code <> NEW.account_code
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'هذا الموظف له حساب ذمم قائم (%) — لا يمكن إنشاء حساب ثانٍ له', v_existing
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_employee_sub_account_insert ON public.accounts;
CREATE TRIGGER trg_guard_employee_sub_account_insert
BEFORE INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_sub_account_insert();

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_active_employee_link
  ON public.accounts (user_id, employee_id)
  WHERE employee_id IS NOT NULL AND is_active IS NOT FALSE;