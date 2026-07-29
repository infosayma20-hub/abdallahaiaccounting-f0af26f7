CREATE OR REPLACE FUNCTION public.sync_manual_journal_employee_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id uuid;
  v_is_debit boolean;
  v_category text;
BEGIN
  -- Only manual journal entries
  IF COALESCE(NEW.transaction_type, '') <> 'manual_journal' THEN
    RETURN NEW;
  END IF;

  -- Resolve employee from the employee sub-ledger account (children of 2180)
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

  -- Soft-deleted entry -> remove the wallet movement
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
         salary_month = EXTRACT(MONTH FROM NEW.transaction_date)::int,
         salary_year = EXTRACT(YEAR FROM NEW.transaction_date)::int,
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
$$;

DROP TRIGGER IF EXISTS trg_sync_manual_journal_employee_movement ON public.transactions;
CREATE TRIGGER trg_sync_manual_journal_employee_movement
AFTER INSERT OR UPDATE OF amount, description, transaction_date, is_deleted, debit_account_code, credit_account_code
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_manual_journal_employee_movement();