-- DEPRECATED: replaced by payroll_pay_employee / payroll_pay_batch RPCs (B3.7)
-- Removed on 2026-04-29 as part of payroll posting hardening.
-- The trigger trg_auto_journal_payroll was already dropped in B3.7. This
-- function was the orphan handler attached to it. Kept here for audit only.
--
-- Why removed:
--   * All payment posting now flows through controlled SECURITY DEFINER RPCs.
--   * trg_guard_employee_payroll_payment blocks any direct UPDATE to is_paid,
--     so this function would never legitimately fire again.
--   * Leaving it in the database invites accidental future re-attachment or
--     ad-hoc invocation, risking duplicate journal entries.
--
-- Original definition (do NOT re-deploy without an architectural review):

CREATE OR REPLACE FUNCTION public.auto_journal_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_name TEXT;
  v_tx_id UUID;
  v_period TEXT;
BEGIN
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    SELECT full_name INTO v_employee_name
    FROM public.employees
    WHERE id = NEW.employee_id;

    v_period := NEW.period_month || '/' || NEW.period_year;

    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, payment_method,
      idempotency_key
    ) VALUES (
      NEW.user_id,
      COALESCE(NEW.paid_date, CURRENT_DATE),
      'راتب ' || COALESCE(v_employee_name, '') || ' - ' || v_period,
      '5150',
      '1110',
      NEW.net_salary,
      'شيكل',
      'salary',
      'PAYROLL-' || NEW.id,
      'نقدي',
      'PAYROLL-' || NEW.id
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.employee_payroll
    SET linked_transaction_id = v_tx_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;