-- ============================================================
-- Extract the journal-creation logic into a reusable function
-- keyed by the movement UUID, using pos_orders.id (UUID) as the
-- primary link — never text order_number.
-- ============================================================
CREATE OR REPLACE FUNCTION public.backfill_pos_meal_journal(p_movement_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m               RECORD;
  v_company_id    UUID;
  v_settings      RECORD;
  v_company_acc   TEXT;
  v_employee_acc  TEXT;
  v_company_name  TEXT;
  v_employee_name TEXT;
  v_emp_name      TEXT;
  v_full          NUMERIC;
  v_deducted      NUMERIC;
  v_company_share NUMERIC;
  v_ref           TEXT;
  v_voucher_id    UUID;
  v_tx_id         UUID;
  v_src_debit     TEXT;
BEGIN
  SELECT * INTO m FROM public.employee_financial_movements WHERE id = p_movement_id;
  IF NOT FOUND OR m.source_type <> 'pos_meal' OR m.journal_entry_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_company_id FROM public.companies WHERE owner_id = m.user_id LIMIT 1;
  IF v_company_id IS NULL THEN RETURN NULL; END IF;

  SELECT auto_journal_for_meals, meal_company_share_account_code
    INTO v_settings
  FROM public.payroll_settings
  WHERE company_id = v_company_id;

  IF NOT FOUND OR NOT COALESCE(v_settings.auto_journal_for_meals, false) THEN RETURN NULL; END IF;
  IF v_settings.meal_company_share_account_code IS NULL THEN RETURN NULL; END IF;

  v_deducted := COALESCE(m.amount, 0);
  v_full     := COALESCE(m.original_full_amount, v_deducted);
  v_company_share := GREATEST(0, v_full - v_deducted);
  IF v_company_share <= 0 THEN RETURN NULL; END IF;

  -- PRIMARY LINK: pos_orders.id = movement.source_id (UUID, unique, never collides)
  IF m.source_id IS NOT NULL THEN
    SELECT t.debit_account_code INTO v_src_debit
    FROM public.transactions t
    JOIN public.accounts a
      ON a.user_id = t.user_id AND a.account_code = t.debit_account_code
    WHERE t.user_id = m.user_id
      AND t.transaction_type = 'pos_sale'
      AND t.pos_order_id = m.source_id
      AND a.parent_code = '2180'
    ORDER BY t.created_at ASC
    LIMIT 1;
  END IF;

  IF v_src_debit IS NULL THEN
    RAISE WARNING 'backfill_pos_meal_journal: employee sub-account (child of 2180) not found for movement % (source_id=%)', m.id, m.source_id;
    RETURN NULL;
  END IF;

  v_employee_acc := v_src_debit;
  v_company_acc  := v_settings.meal_company_share_account_code;

  SELECT account_name INTO v_company_name FROM public.accounts
   WHERE user_id = m.user_id AND account_code = v_company_acc LIMIT 1;
  SELECT account_name INTO v_employee_name FROM public.accounts
   WHERE user_id = m.user_id AND account_code = v_employee_acc LIMIT 1;

  IF v_company_name IS NULL OR v_employee_name IS NULL THEN
    RAISE WARNING 'backfill_pos_meal_journal: account names not resolved (% / %)', v_company_acc, v_employee_acc;
    RETURN NULL;
  END IF;

  SELECT full_name INTO v_emp_name FROM public.employees WHERE id = m.employee_id;
  v_ref := 'JV-MEAL-' || SUBSTRING(m.id::text, 1, 8);

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, idempotency_key
  ) VALUES (
    m.user_id, m.movement_date,
    'تسوية حصة الشركة - وجبة ' || COALESCE(v_emp_name, '') || ' - ' || COALESCE(m.source_reference, ''),
    v_company_acc, v_employee_acc,
    v_company_share, 'شيكل', 'journal',
    m.source_reference, 'MEAL-ADJ-' || m.id::TEXT
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.vouchers (
    user_id, type, subtype, ref_number, date, amount, amount_ils, currency,
    description, status, posted_at, employee_id, linked_transaction_id
  ) VALUES (
    m.user_id, 'journal', 'auto_pos_meal', v_ref, m.movement_date,
    v_company_share, v_company_share, 'ILS',
    'تسوية حصة الشركة - وجبة موظف ' || COALESCE(v_emp_name, '') ||
      CASE WHEN m.reference_number IS NOT NULL THEN ' - ' || m.reference_number ELSE '' END,
    'posted', NOW(), m.employee_id, v_tx_id
  ) RETURNING id INTO v_voucher_id;

  INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order)
  VALUES (v_voucher_id, v_company_acc, v_company_name, v_company_share, 0,
          'حصة الشركة من وجبة الموظف', 1);

  INSERT INTO public.voucher_lines (voucher_id, account_code, account_name, debit, credit, description, line_order, contact_name)
  VALUES (v_voucher_id, v_employee_acc, v_employee_name, 0, v_company_share,
          'تخفيض ذمة الموظف - حصة الشركة', 2, v_emp_name);

  UPDATE public.employee_financial_movements
     SET journal_entry_id = v_voucher_id
   WHERE id = m.id;

  RETURN v_voucher_id;
END;
$fn$;

-- ============================================================
-- Rewire the AFTER-INSERT trigger to delegate to the same function
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_journal_pos_meal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.source_type <> 'pos_meal' OR NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.backfill_pos_meal_journal(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_journal_pos_meal delegate failed for movement %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backfill_pos_meal_journal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_pos_meal_journal(UUID) TO service_role;