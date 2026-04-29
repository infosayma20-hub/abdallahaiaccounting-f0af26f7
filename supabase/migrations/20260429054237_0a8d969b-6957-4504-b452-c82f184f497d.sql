-- B3.7.1.1 — Dynamic payment-account selection for payroll
-- Replace the internal posting function and both RPCs with a version
-- that lets the cashier pick the actual GL account (cash box, bank, cheque
-- account, visa, etc.) from the company's chart of accounts.

CREATE OR REPLACE FUNCTION public._payroll_post_payment(
  _payroll_id uuid,
  _payer uuid,
  _payment_method text,
  _bank_account_id uuid,
  _cheque_number text,
  _cheque_due_date date,
  _payment_date date,
  _payment_account_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.employee_payroll%ROWTYPE;
  _emp_name text;
  _credit_code text;
  _credit_account public.accounts%ROWTYPE;
  _voucher_id uuid;
  _tx_id uuid;
  _voucher_subtype text;
  _ref text;
  _bank_row public.bank_accounts%ROWTYPE;
  _period text;
  _has_children boolean;
BEGIN
  SELECT * INTO _row FROM public.employee_payroll WHERE id = _payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل الراتب غير موجود';
  END IF;

  IF _row.status::text <> 'approved' THEN
    RAISE EXCEPTION 'لا يمكن دفع راتب بحالة % (يجب أن يكون معتمداً)', _row.status;
  END IF;

  IF _row.is_paid OR _row.voucher_id IS NOT NULL OR _row.linked_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'تم دفع هذا الراتب مسبقاً';
  END IF;

  IF _payment_method NOT IN ('cash','bank','cheque') THEN
    RAISE EXCEPTION 'طريقة دفع غير مدعومة: %', _payment_method;
  END IF;

  -- ── Resolve credit account ──────────────────────────────────────────
  -- Priority:
  --   1) explicit _payment_account_code (from user's chart of accounts)
  --   2) bank-derived code (gl_account_code / outgoing_checks_account_code)
  --   3) legacy fallback (1110/1120/1160) — only as last resort

  IF _payment_account_code IS NOT NULL AND length(trim(_payment_account_code)) > 0 THEN
    -- Validate the account belongs to the same owner and is postable.
    SELECT * INTO _credit_account
    FROM public.accounts
    WHERE account_code = _payment_account_code
      AND user_id = _row.user_id
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'حساب الدفع % غير موجود أو غير نشط لهذه الشركة', _payment_account_code;
    END IF;

    -- Block posting to parent accounts.
    SELECT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE parent_code = _credit_account.account_code
        AND user_id = _row.user_id
        AND is_active = true
    ) INTO _has_children;

    IF _has_children THEN
      RAISE EXCEPTION 'لا يمكن الترحيل على الحساب الرئيسي %. اختر حساباً فرعياً.', _credit_account.account_code;
    END IF;

    _credit_code := _credit_account.account_code;
  END IF;

  IF _payment_method = 'cash' THEN
    _voucher_subtype := 'cash';
    IF _credit_code IS NULL THEN
      RAISE EXCEPTION 'يرجى اختيار صندوق/حساب نقدي للدفع';
    END IF;

  ELSIF _payment_method = 'bank' THEN
    _voucher_subtype := 'bank';
    IF _credit_code IS NULL THEN
      IF _bank_account_id IS NULL THEN
        RAISE EXCEPTION 'يرجى اختيار الحساب البنكي للدفع';
      END IF;
      SELECT * INTO _bank_row FROM public.bank_accounts WHERE id = _bank_account_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'حساب البنك غير موجود'; END IF;
      _credit_code := _bank_row.gl_account_code;
      IF _credit_code IS NULL OR length(trim(_credit_code)) = 0 THEN
        RAISE EXCEPTION 'حساب البنك المختار لا يحتوي على ربط محاسبي (gl_account_code).';
      END IF;
    END IF;

  ELSIF _payment_method = 'cheque' THEN
    _voucher_subtype := 'cheque';
    IF _cheque_number IS NULL OR length(trim(_cheque_number)) = 0 THEN
      RAISE EXCEPTION 'رقم الشيك مطلوب';
    END IF;

    IF _credit_code IS NULL THEN
      IF _bank_account_id IS NOT NULL THEN
        SELECT * INTO _bank_row FROM public.bank_accounts WHERE id = _bank_account_id;
        _credit_code := _bank_row.outgoing_checks_account_code;
      END IF;
      IF _credit_code IS NULL OR length(trim(_credit_code)) = 0 THEN
        RAISE EXCEPTION 'يرجى اختيار حساب الشيكات الصادرة (لا يوجد إعداد افتراضي).';
      END IF;
    END IF;
  END IF;

  -- Final sanity: credit account must exist for this owner.
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_code = _credit_code AND user_id = _row.user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'حساب الدفع % غير معرّف في دليل الحسابات. يرجى تعريفه أولاً.', _credit_code;
  END IF;

  SELECT full_name INTO _emp_name FROM public.employees WHERE id = _row.employee_id;
  _period := _row.period_month || '/' || _row.period_year;
  _ref := 'PAYROLL-' || _row.id;

  -- إنشاء سند الصرف
  INSERT INTO public.vouchers (
    user_id, type, subtype, ref_number, date, employee_id,
    payment_method, bank_account_id,
    amount, currency, exchange_rate, amount_ils,
    description, notes, status,
    cheque_number, cheque_due_date,
    posted_by, posted_at
  ) VALUES (
    _row.user_id, 'payment', _voucher_subtype,
    'PV-PAY-' || substr(_row.id::text, 1, 8),
    _payment_date, _row.employee_id,
    _payment_method, _bank_account_id,
    _row.net_salary, 'ILS', 1, _row.net_salary,
    'صرف راتب ' || COALESCE(_emp_name,'') || ' - ' || _period,
    'سند صرف راتب — ' || _ref,
    'posted',
    _cheque_number, _cheque_due_date,
    _payer, now()
  ) RETURNING id INTO _voucher_id;

  -- إنشاء القيد المحاسبي
  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, payment_method,
    idempotency_key
  ) VALUES (
    _row.user_id, _payment_date,
    'راتب ' || COALESCE(_emp_name,'') || ' - ' || _period,
    '5150', _credit_code,
    _row.net_salary, 'ILS', 'salary', _ref, _payment_method,
    _ref
  ) RETURNING id INTO _tx_id;

  -- ربط الراتب بالحالة paid (مع حارس الجلسة)
  PERFORM set_config('app.payroll_paying', 'on', true);
  UPDATE public.employee_payroll SET
    voucher_id = _voucher_id,
    linked_transaction_id = _tx_id,
    payment_method = _payment_method,
    is_paid = true,
    paid_date = _payment_date,
    status = 'paid'::payroll_status
  WHERE id = _payroll_id;
  PERFORM set_config('app.payroll_paying', 'off', true);

  UPDATE public.vouchers SET linked_transaction_id = _tx_id WHERE id = _voucher_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payroll_id', _payroll_id,
    'voucher_id', _voucher_id,
    'transaction_id', _tx_id,
    'amount', _row.net_salary,
    'credit_code', _credit_code
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.payroll_pay_employee(
  _payroll_id uuid,
  _payer uuid,
  _payment_method text,
  _bank_account_id uuid DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _payment_date date DEFAULT NULL,
  _payment_account_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public._payroll_post_payment(
    _payroll_id, _payer, _payment_method,
    _bank_account_id, _cheque_number, _cheque_due_date,
    COALESCE(_payment_date, CURRENT_DATE),
    _payment_account_code
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.payroll_pay_batch(
  _user_id uuid,
  _month integer,
  _year integer,
  _payer uuid,
  _payment_method text,
  _bank_account_id uuid DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _payment_date date DEFAULT NULL,
  _payment_account_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
  _id uuid;
  _count int := 0;
  _total numeric := 0;
  _batch_id uuid;
  _date date := COALESCE(_payment_date, CURRENT_DATE);
BEGIN
  SELECT array_agg(id) INTO _ids
  FROM public.employee_payroll
  WHERE user_id = _user_id
    AND period_month = _month
    AND period_year = _year
    AND status::text = 'approved'
    AND COALESCE(is_paid, false) = false;

  IF _ids IS NULL OR array_length(_ids, 1) = 0 THEN
    RAISE EXCEPTION 'لا توجد رواتب معتمدة قابلة للدفع لهذا الشهر';
  END IF;

  FOREACH _id IN ARRAY _ids LOOP
    PERFORM public._payroll_post_payment(
      _id, _payer, _payment_method,
      _bank_account_id, _cheque_number, _cheque_due_date, _date,
      _payment_account_code
    );
    _count := _count + 1;
    SELECT _total + net_salary INTO _total FROM public.employee_payroll WHERE id = _id;
  END LOOP;

  UPDATE public.payroll_batches
  SET status = 'paid'::payroll_status,
      paid_by = _payer,
      paid_at = now(),
      payment_method = _payment_method
  WHERE user_id = _user_id AND period_month = _month AND period_year = _year
  RETURNING id INTO _batch_id;

  RETURN jsonb_build_object(
    'ok', true, 'paid_count', _count,
    'total_amount', _total, 'batch_id', _batch_id
  );
END;
$function$;