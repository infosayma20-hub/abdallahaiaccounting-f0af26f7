CREATE OR REPLACE FUNCTION public.sync_manual_journal_employee_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_id uuid;
  v_is_debit boolean;
  v_category text;
  v_desc text;
  v_voucher_id uuid;
BEGIN
  IF COALESCE(NEW.transaction_type, '') <> 'manual_journal' THEN
    RETURN NEW;
  END IF;

  v_desc := COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.reference, '');

  IF v_desc ILIKE '%صرف راتب%' OR v_desc ILIKE '%صرف رواتب%' OR v_desc ILIKE '%دفع راتب%'
     OR v_desc ILIKE '%دفع رواتب%' OR v_desc ILIKE '%سداد راتب%' OR v_desc ILIKE '%تسديد راتب%'
     OR v_desc ILIKE '%مسير رواتب%' OR v_desc ILIKE '%رواتب شهر%'
     OR v_desc ILIKE '%PAYROLL%' OR v_desc ILIKE '%PV-PAY%'
  THEN
    DELETE FROM public.employee_financial_movements WHERE source_id = NEW.id;
    RETURN NEW;
  END IF;

  -- TENANT-SCOPED lookup: both the sub-ledger account and the employee MUST belong
  -- to the same tenant as the transaction. Account codes (e.g. 21803) are reused
  -- across tenants, so an unscoped join could attach the movement to a foreign employee.
  SELECT e.id, (a.account_code = NEW.debit_account_code)
    INTO v_emp_id, v_is_debit
  FROM public.accounts a
  JOIN public.employees e
    ON e.full_name = trim(replace(a.account_name, 'ذمم موظف - ', ''))
   AND e.user_id = NEW.user_id
  WHERE a.parent_code = '2180'
    AND a.user_id = NEW.user_id
    AND a.account_code IN (NEW.debit_account_code, NEW.credit_account_code)
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_deleted, false) THEN
    DELETE FROM public.employee_financial_movements WHERE source_id = NEW.id;
    RETURN NEW;
  END IF;

  v_category := CASE
    WHEN NEW.description ILIKE '%عجز%' THEN 'cash_shortage'
    WHEN NEW.description ILIKE '%فائض%' THEN 'cash_surplus'
    WHEN NEW.description ILIKE '%سلف%' OR NEW.description ILIKE '%راتب%' THEN 'advance'
    WHEN NEW.description ILIKE '%اكل%' OR NEW.description ILIKE '%أكل%' OR NEW.description ILIKE '%وجب%' THEN 'food'
    WHEN NEW.description ILIKE '%خصم%' OR NEW.description ILIKE '%تنبيه%' OR NEW.description ILIKE '%عقاب%' THEN 'penalty'
    ELSE 'purchase'
  END;

  UPDATE public.employee_financial_movements
     SET amount = NEW.amount,
         original_full_amount = NEW.amount,
         description = COALESCE(NULLIF(trim(NEW.description), ''), 'قيد يدوي'),
         movement_type = CASE WHEN v_is_debit THEN 'debit' ELSE 'credit' END,
         movement_date = NEW.transaction_date,
         salary_month = CASE WHEN salary_month_locked THEN salary_month
                             ELSE EXTRACT(MONTH FROM NEW.transaction_date)::int END,
         salary_year  = CASE WHEN salary_month_locked THEN salary_year
                             ELSE EXTRACT(YEAR FROM NEW.transaction_date)::int END,
         category = v_category,
         source_reference = NEW.reference,
         updated_at = now()
   WHERE source_id = NEW.id;

  IF NOT FOUND THEN
    v_voucher_id := substring(COALESCE(NEW.idempotency_key,'') from 'VOUCHER-([0-9a-f-]{36})')::uuid;
    IF v_voucher_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.employee_financial_movements m
       WHERE m.source_id = v_voucher_id
         AND m.employee_id = v_emp_id
         AND m.amount = NEW.amount
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.employee_financial_movements
      (user_id, employee_id, source_type, source_id, source_reference, description, amount,
       movement_type, status, movement_date, salary_month, salary_year, created_by,
       journal_entry_id, notes, category, original_full_amount)
    VALUES
      (NEW.user_id, v_emp_id, 'finance_manual', NEW.id, NEW.reference,
       COALESCE(NULLIF(trim(NEW.description), ''), 'قيد يدوي'), NEW.amount,
       CASE WHEN v_is_debit THEN 'debit' ELSE 'credit' END,
       'approved', NEW.transaction_date,
       EXTRACT(MONTH FROM NEW.transaction_date)::int,
       EXTRACT(YEAR FROM NEW.transaction_date)::int,
       NEW.user_id, NEW.id,
       'تم إنشاؤها تلقائياً من سند قيد يدوي', v_category, NEW.amount);
  END IF;

  RETURN NEW;
END;
$function$;

-- Hard guard: a financial movement can never point at an employee of another tenant.
CREATE OR REPLACE FUNCTION public.guard_efm_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_owner uuid;
BEGIN
  SELECT user_id INTO v_emp_owner FROM public.employees WHERE id = NEW.employee_id;
  IF v_emp_owner IS NOT NULL AND v_emp_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'حركة مالية مرفوضة: الموظف تابع لشركة أخرى (tenant mismatch)';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_efm_tenant_match ON public.employee_financial_movements;
CREATE TRIGGER trg_efm_tenant_match
BEFORE INSERT OR UPDATE OF employee_id, user_id ON public.employee_financial_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_efm_tenant_match();