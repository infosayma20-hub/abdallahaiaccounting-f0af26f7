
-- =============================================
-- MIGRATION 2: Accounting Automation Triggers
-- C-03: Auto journal entries for payroll, cheques
-- =============================================

-- 1. Trigger: Auto-create journal entry when payroll is marked as paid
CREATE OR REPLACE FUNCTION public.auto_journal_payroll()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name TEXT;
  v_tx_id UUID;
  v_period TEXT;
BEGIN
  -- Only fire when is_paid changes from false to true
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    -- Get employee name
    SELECT full_name INTO v_employee_name
    FROM public.employees
    WHERE id = NEW.employee_id;

    v_period := NEW.period_month || '/' || NEW.period_year;

    -- Create salary expense journal entry
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, payment_method,
      idempotency_key
    ) VALUES (
      NEW.user_id,
      COALESCE(NEW.paid_date, CURRENT_DATE),
      'راتب ' || COALESCE(v_employee_name, '') || ' - ' || v_period,
      '5100', -- مصروف الرواتب
      '1110', -- الصندوق (default, can be overridden)
      NEW.net_salary,
      'شيكل',
      'salary',
      'PAYROLL-' || NEW.id,
      'نقدي',
      'PAYROLL-' || NEW.id
    )
    RETURNING id INTO v_tx_id;

    -- Link back to payroll record
    UPDATE public.employee_payroll
    SET linked_transaction_id = v_tx_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_journal_payroll
  AFTER UPDATE ON public.employee_payroll
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_journal_payroll();

-- 2. Trigger: Auto-create journal entry when cheque status changes to collected
CREATE OR REPLACE FUNCTION public.auto_journal_cheque_collection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_debit TEXT;
  v_credit TEXT;
  v_desc TEXT;
BEGIN
  -- Only fire when status changes to 'محصل' (collected)
  IF NEW.status = 'محصل' AND OLD.status != 'محصل' THEN
    IF NEW.cheque_type = 'صادر' THEN
      -- Outgoing cheque collected: reduce liability
      v_debit := '2100'; -- ذمم موردين
      v_credit := '1120'; -- البنك
      v_desc := 'تحصيل شيك صادر - ' || COALESCE(NEW.party_name, '');
    ELSE
      -- Incoming cheque collected: deposit to bank
      v_debit := '1120'; -- البنك
      v_credit := '1150'; -- شيكات واردة
      v_desc := 'تحصيل شيك وارد - ' || COALESCE(NEW.party_name, '');
    END IF;

    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference,
      idempotency_key
    ) VALUES (
      NEW.user_id,
      CURRENT_DATE,
      v_desc,
      v_debit, v_credit,
      NEW.amount,
      COALESCE(NEW.currency, 'شيكل'),
      'cheque_collection',
      'CHQ-' || COALESCE(NEW.cheque_number, NEW.id::TEXT),
      'CHQ-COLLECT-' || NEW.id
    )
    RETURNING id INTO v_tx_id;

    -- Link transaction back to cheque
    UPDATE public.cheques
    SET linked_transaction_id = v_tx_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_journal_cheque
  AFTER UPDATE ON public.cheques
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_journal_cheque_collection();
