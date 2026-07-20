
-- 1) Add columns to termination_records
ALTER TABLE public.termination_records
  ADD COLUMN IF NOT EXISTS income_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS journal_voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journal_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cheque_number text;

-- 2) RPC: post settlement journal
CREATE OR REPLACE FUNCTION public.post_settlement_journal(
  _termination_id uuid,
  _payment_method text DEFAULT 'cash',
  _bank_account_id uuid DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _payment_date date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.termination_records%ROWTYPE;
  _emp_name text;
  _credit_code text;
  _voucher_id uuid;
  _voucher_subtype text;
  _ref text;
  _bank_row public.bank_accounts%ROWTYPE;
  _gross numeric;
  _net_paid numeric;
  _ded numeric;
  _tax numeric;
BEGIN
  SELECT * INTO _row FROM public.termination_records WHERE id = _termination_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'سجل المخالصة غير موجود'; END IF;

  IF _row.journal_voucher_id IS NOT NULL THEN
    RAISE EXCEPTION 'تم ترحيل قيد هذه المخالصة مسبقاً';
  END IF;

  IF _payment_method NOT IN ('cash','bank','cheque') THEN
    RAISE EXCEPTION 'طريقة دفع غير مدعومة: %', _payment_method;
  END IF;

  -- Determine credit account
  IF _payment_method = 'cash' THEN
    _credit_code := '1110';
    _voucher_subtype := 'cash';
  ELSIF _payment_method = 'bank' THEN
    IF _bank_account_id IS NULL THEN RAISE EXCEPTION 'يجب اختيار حساب بنكي للدفع البنكي'; END IF;
    SELECT * INTO _bank_row FROM public.bank_accounts WHERE id = _bank_account_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'حساب البنك غير موجود'; END IF;
    _credit_code := COALESCE(_bank_row.gl_account_code, '1120');
    _voucher_subtype := 'bank';
  ELSE
    IF _cheque_number IS NULL OR length(trim(_cheque_number)) = 0 THEN
      RAISE EXCEPTION 'رقم الشيك مطلوب';
    END IF;
    IF _bank_account_id IS NOT NULL THEN
      SELECT * INTO _bank_row FROM public.bank_accounts WHERE id = _bank_account_id;
      _credit_code := COALESCE(_bank_row.outgoing_checks_account_code, '1160');
    ELSE
      _credit_code := '1160';
    END IF;
    _voucher_subtype := 'cheque';
  END IF;

  SELECT full_name INTO _emp_name FROM public.employees WHERE id = _row.employee_id;

  _gross    := COALESCE(_row.severance_pay,0) + COALESCE(_row.unused_leave_pay,0) + COALESCE(_row.current_month_salary,0);
  _ded      := COALESCE(_row.advance_balance,0) + COALESCE(_row.other_deductions,0);
  _tax      := COALESCE(_row.income_tax,0);
  _net_paid := _gross - _ded - _tax;
  IF _net_paid < 0 THEN _net_paid := 0; END IF;

  _ref := 'SETTLE-' || _row.id;

  -- Create payment voucher
  INSERT INTO public.vouchers (
    user_id, type, subtype, ref_number, date, employee_id,
    payment_method, bank_account_id,
    amount, currency, exchange_rate, amount_ils,
    description, notes, status,
    cheque_number, cheque_due_date,
    posted_by, posted_at
  ) VALUES (
    _row.user_id, 'payment', _voucher_subtype,
    'PV-SETTLE-' || substr(_row.id::text, 1, 8),
    _payment_date, _row.employee_id,
    _payment_method, _bank_account_id,
    _net_paid, 'ILS', 1, _net_paid,
    'مخالصة نهاية خدمة - ' || COALESCE(_emp_name, ''),
    'سند صرف مخالصة — ' || _ref,
    'posted',
    _cheque_number, _cheque_due_date,
    auth.uid(), now()
  ) RETURNING id INTO _voucher_id;

  -- JE 1: Salary expense against cash/bank for the NET PAID
  IF _net_paid > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, payment_method,
      idempotency_key
    ) VALUES (
      _row.user_id, _payment_date,
      'صافي مخالصة نهاية خدمة - ' || COALESCE(_emp_name,''),
      '5150', _credit_code,
      _net_paid, 'ILS', 'salary', _ref, _payment_method,
      _ref || '-NET'
    );
  END IF;

  -- JE 2: Income tax withholding
  IF _tax > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference,
      idempotency_key
    ) VALUES (
      _row.user_id, _payment_date,
      'ضريبة دخل مستقطعة من مخالصة - ' || COALESCE(_emp_name,''),
      '5150', '2140',
      _tax, 'ILS', 'salary', _ref,
      _ref || '-TAX'
    );
  END IF;

  UPDATE public.termination_records
     SET journal_voucher_id = _voucher_id,
         journal_posted_at = now(),
         payment_method = _payment_method,
         bank_account_id = _bank_account_id,
         cheque_number = _cheque_number,
         is_paid = true,
         paid_date = _payment_date
   WHERE id = _termination_id;

  -- Mark employee terminated
  UPDATE public.employees
     SET is_terminated = true, is_active = false, end_date = _row.termination_date
   WHERE id = _row.employee_id AND user_id = _row.user_id;

  RETURN _voucher_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_settlement_journal(uuid, text, uuid, text, date, date) TO authenticated;
