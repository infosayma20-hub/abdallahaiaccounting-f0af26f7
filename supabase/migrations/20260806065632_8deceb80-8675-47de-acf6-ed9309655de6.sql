-- 1) Lock flag for manually chosen deduction month
ALTER TABLE public.employee_financial_movements
  ADD COLUMN IF NOT EXISTS salary_month_locked boolean NOT NULL DEFAULT false;

-- 2) Respect the lock inside the manual-journal sync trigger
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
BEGIN
  IF COALESCE(NEW.transaction_type, '') <> 'manual_journal' THEN
    RETURN NEW;
  END IF;

  v_desc := COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.reference, '');

  IF v_desc ILIKE '%صرف راتب%'
     OR v_desc ILIKE '%صرف رواتب%'
     OR v_desc ILIKE '%دفع راتب%'
     OR v_desc ILIKE '%دفع رواتب%'
     OR v_desc ILIKE '%سداد راتب%'
     OR v_desc ILIKE '%تسديد راتب%'
     OR v_desc ILIKE '%مسير رواتب%'
     OR v_desc ILIKE '%رواتب شهر%'
     OR v_desc ILIKE '%PAYROLL%'
     OR v_desc ILIKE '%PV-PAY%'
  THEN
    DELETE FROM public.employee_financial_movements WHERE source_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT e.id, (a.account_code = NEW.debit_account_code)
    INTO v_emp_id, v_is_debit
  FROM public.accounts a
  JOIN public.employees e
    ON e.full_name = trim(replace(a.account_name, 'ذمم موظف - ', ''))
  WHERE a.parent_code = '2180'
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

-- 3) Hard-delete of a transaction must clean its mirrored wallet movement
CREATE OR REPLACE FUNCTION public.cleanup_employee_movement_on_tx_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.employee_financial_movements WHERE source_id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cleanup_employee_movement_on_tx_delete ON public.transactions;
CREATE TRIGGER trg_cleanup_employee_movement_on_tx_delete
AFTER DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.cleanup_employee_movement_on_tx_delete();

-- 4) Exclusions list: entries that must not count as salary deductions
CREATE TABLE IF NOT EXISTS public.hr_deduction_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_kind, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_deduction_exclusions TO authenticated;
GRANT ALL ON public.hr_deduction_exclusions TO service_role;

ALTER TABLE public.hr_deduction_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage deduction exclusions"
ON public.hr_deduction_exclusions
FOR ALL
TO authenticated
USING (public.is_team_member((SELECT auth.uid()), user_id))
WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

CREATE TRIGGER trg_hr_deduction_exclusions_updated_at
BEFORE UPDATE ON public.hr_deduction_exclusions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
