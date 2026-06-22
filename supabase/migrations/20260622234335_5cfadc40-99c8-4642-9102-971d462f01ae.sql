
-- 1) Create company-share meal expense account (idempotent, per tenant)
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_active)
SELECT DISTINCT user_id, '5316', 'وجبات الموظفين (حصة الشركة)', 'مصاريف', '5310', true
FROM public.accounts
WHERE account_code = '5310'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a2
    WHERE a2.user_id = public.accounts.user_id AND a2.account_code = '5316'
  );

-- 2) Configure payroll_settings to auto-journal meals
UPDATE public.payroll_settings
SET auto_journal_for_meals = true,
    meal_company_share_account_code = COALESCE(meal_company_share_account_code, '5316'),
    meal_employee_payable_account_code = COALESCE(meal_employee_payable_account_code, '2180');

-- 3) Rewrite trigger function
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
  v_src_debit TEXT;
BEGIN
  IF NEW.source_type <> 'pos_meal' OR NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_company_id FROM public.companies WHERE owner_id = NEW.user_id LIMIT 1;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  SELECT auto_journal_for_meals, meal_company_share_account_code
    INTO v_settings
  FROM public.payroll_settings
  WHERE company_id = v_company_id;

  IF NOT FOUND OR NOT COALESCE(v_settings.auto_journal_for_meals, false) THEN
    RETURN NEW;
  END IF;
  IF v_settings.meal_company_share_account_code IS NULL THEN
    RETURN NEW;
  END IF;

  v_deducted := COALESCE(NEW.amount, 0);
  v_full := COALESCE(NEW.original_full_amount, v_deducted);
  v_company_share := GREATEST(0, v_full - v_deducted);
  IF v_company_share <= 0 THEN RETURN NEW; END IF;

  SELECT debit_account_code INTO v_src_debit
  FROM public.transactions
  WHERE user_id = NEW.user_id
    AND transaction_type = 'pos_sale'
    AND reference = NEW.source_reference
    AND debit_account_code LIKE '218%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_src_debit IS NULL THEN
    RAISE WARNING 'auto_journal_pos_meal: source POS tx not found for ref %', NEW.source_reference;
    RETURN NEW;
  END IF;

  v_employee_acc := v_src_debit;
  v_company_acc  := v_settings.meal_company_share_account_code;

  SELECT account_name INTO v_company_name FROM public.accounts
   WHERE user_id = NEW.user_id AND account_code = v_company_acc LIMIT 1;
  SELECT account_name INTO v_employee_name FROM public.accounts
   WHERE user_id = NEW.user_id AND account_code = v_employee_acc LIMIT 1;

  IF v_company_name IS NULL OR v_employee_name IS NULL THEN
    RAISE WARNING 'auto_journal_pos_meal: account names not resolved (% / %)', v_company_acc, v_employee_acc;
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_emp_name FROM public.employees WHERE id = NEW.employee_id;
  v_ref := 'JV-MEAL-' || SUBSTRING(NEW.id::text, 1, 8);

  BEGIN
    INSERT INTO public.vouchers (
      user_id, type, subtype, ref_number, date, amount, amount_ils, currency,
      description, status, posted_at, employee_id, linked_transaction_id
    ) VALUES (
      NEW.user_id, 'journal', 'auto_pos_meal', v_ref, NEW.movement_date,
      v_company_share, v_company_share, 'ILS',
      'تسوية حصة الشركة - وجبة موظف ' || COALESCE(v_emp_name, '') ||
        CASE WHEN NEW.reference_number IS NOT NULL THEN ' - ' || NEW.reference_number ELSE '' END,
      'posted', NOW(), NEW.employee_id, NEW.source_id
    ) RETURNING id INTO v_voucher_id;

    INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order)
    VALUES (v_voucher_id, v_company_acc, v_company_name, v_company_share, 0,
            'حصة الشركة من وجبة الموظف', 1);

    INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order, contact_name)
    VALUES (v_voucher_id, v_employee_acc, v_employee_name, 0, v_company_share,
            'تخفيض ذمة الموظف - حصة الشركة', 2, v_emp_name);

    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key
    ) VALUES (
      NEW.user_id, NEW.movement_date,
      'تسوية حصة الشركة - وجبة ' || COALESCE(v_emp_name, '') || ' - ' || COALESCE(NEW.source_reference, ''),
      v_company_acc, v_employee_acc,
      v_company_share, 'شيكل', 'journal',
      NEW.source_reference, 'MEAL-ADJ-' || NEW.id::TEXT
    );

    UPDATE public.employee_financial_movements
       SET journal_entry_id = v_voucher_id
     WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_journal_pos_meal failed for movement %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 4) Backfill for the two existing pos_meal rows: re-fire the trigger by issuing a no-op UPDATE
--    via an AFTER UPDATE wrapper. Easier path: directly call the function via a wrapper.
CREATE OR REPLACE FUNCTION public._backfill_pos_meal(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.employee_financial_movements WHERE id = p_id;
  IF r IS NULL OR r.journal_entry_id IS NOT NULL THEN RETURN; END IF;
  -- Re-INSERT into a temp scope: simplest = run the trigger function by performing a trivial
  -- self-update that fires AFTER UPDATE if we add such a trigger. Instead, replicate by
  -- INSERTing then DELETEing — too risky. Use a dedicated AFTER UPDATE trigger temporarily.
  PERFORM 1;
END;
$$;

-- Add temporary AFTER UPDATE firing of the same function, run backfill, then drop it.
DROP TRIGGER IF EXISTS trg_auto_journal_pos_meal_upd ON public.employee_financial_movements;
CREATE TRIGGER trg_auto_journal_pos_meal_upd
AFTER UPDATE ON public.employee_financial_movements
FOR EACH ROW
WHEN (NEW.source_type = 'pos_meal' AND NEW.journal_entry_id IS NULL)
EXECUTE FUNCTION public.auto_journal_pos_meal();

UPDATE public.employee_financial_movements
SET updated_at = NOW()
WHERE source_type = 'pos_meal'
  AND journal_entry_id IS NULL;

DROP TRIGGER IF EXISTS trg_auto_journal_pos_meal_upd ON public.employee_financial_movements;
DROP FUNCTION IF EXISTS public._backfill_pos_meal(UUID);
