
CREATE OR REPLACE FUNCTION public.auto_journal_pos_meal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_settings RECORD;
  v_company_acc TEXT;
  v_employee_acc TEXT;
  v_company_name TEXT;
  v_employee_name TEXT;
  v_emp_name TEXT;
  v_full NUMERIC;
  v_deducted NUMERIC;
  v_company_share NUMERIC;
  v_ref TEXT;
  v_voucher_id UUID;
BEGIN
  -- Only for pos_meal rows that don't already have a journal entry
  IF NEW.source_type <> 'pos_meal' OR NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve tenant company + settings
  SELECT id INTO v_company_id FROM public.companies WHERE owner_id = NEW.user_id LIMIT 1;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  SELECT auto_journal_for_meals,
         meal_company_share_account_code,
         meal_employee_payable_account_code
    INTO v_settings
  FROM public.payroll_settings
  WHERE company_id = v_company_id;

  IF NOT FOUND OR NOT COALESCE(v_settings.auto_journal_for_meals, false) THEN
    RETURN NEW;
  END IF;
  IF v_settings.meal_company_share_account_code IS NULL
     OR v_settings.meal_employee_payable_account_code IS NULL THEN
    RETURN NEW;
  END IF;

  -- Validate both accounts exist for this tenant
  SELECT account_name INTO v_company_name
  FROM public.accounts
  WHERE user_id = NEW.user_id AND account_code = v_settings.meal_company_share_account_code
  LIMIT 1;
  SELECT account_name INTO v_employee_name
  FROM public.accounts
  WHERE user_id = NEW.user_id AND account_code = v_settings.meal_employee_payable_account_code
  LIMIT 1;
  IF v_company_name IS NULL OR v_employee_name IS NULL THEN
    RAISE WARNING 'auto_journal_pos_meal: account codes not found for tenant %', NEW.user_id;
    RETURN NEW;
  END IF;

  v_deducted := COALESCE(NEW.amount, 0);
  v_full := COALESCE(NEW.original_full_amount, v_deducted);
  v_company_share := GREATEST(0, v_full - v_deducted);

  IF v_deducted <= 0 THEN RETURN NEW; END IF;

  SELECT full_name INTO v_emp_name FROM public.employees WHERE id = NEW.employee_id;
  v_ref := 'JV-MEAL-' || SUBSTRING(NEW.id::text, 1, 8);
  v_company_acc := v_settings.meal_company_share_account_code;
  v_employee_acc := v_settings.meal_employee_payable_account_code;

  BEGIN
    INSERT INTO public.vouchers (
      user_id, type, subtype, ref_number, date, amount, amount_ils, currency,
      description, status, posted_at, employee_id, linked_transaction_id
    ) VALUES (
      NEW.user_id, 'journal', 'auto_pos_meal', v_ref, NEW.movement_date,
      v_full, v_full, 'ILS',
      'قيد تلقائي - وجبة POS - ' || COALESCE(v_emp_name, '') ||
        CASE WHEN NEW.reference_number IS NOT NULL THEN ' - فاتورة ' || NEW.reference_number ELSE '' END,
      'posted', NOW(), NEW.employee_id, NEW.source_id
    ) RETURNING id INTO v_voucher_id;

    -- Debit: company share (if any)
    IF v_company_share > 0 THEN
      INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order)
      VALUES (v_voucher_id, v_company_acc, v_company_name, v_company_share, 0,
              'حصة الشركة - وجبة موظف', 1);
    END IF;

    -- Debit: employee meal cost (the deducted portion is also a company-paid cost upfront,
    -- but it becomes receivable from employee). We model it as: Dr employee_payable, Cr cash/POS already booked.
    -- Here we record the employee's liability: Dr employee_payable_account / Cr company_share_account is wrong.
    -- Correct entry for "company paid the meal, employee owes their share":
    --   Dr employee_payable (ذمم موظفين)  = deducted amount  (employee owes us)
    --   Cr company_share_account (مصاريف وجبات / إيراد متبادل) = deducted amount
    -- This reverses part of the cost previously expensed.
    INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order, contact_id, contact_name)
    VALUES (v_voucher_id, v_employee_acc, v_employee_name, v_deducted, 0,
            'ذمة الموظف - ' || COALESCE(v_emp_name, ''), 2, NULL, v_emp_name);

    INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order)
    VALUES (v_voucher_id, v_company_acc, v_company_name, 0, v_full,
            'مقابل قيد وجبة POS', 3);

    -- Link back
    UPDATE public.employee_financial_movements
       SET journal_entry_id = v_voucher_id
     WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_journal_pos_meal failed for movement %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_journal_pos_meal ON public.employee_financial_movements;
CREATE TRIGGER trg_auto_journal_pos_meal
AFTER INSERT ON public.employee_financial_movements
FOR EACH ROW
WHEN (NEW.source_type = 'pos_meal')
EXECUTE FUNCTION public.auto_journal_pos_meal();
