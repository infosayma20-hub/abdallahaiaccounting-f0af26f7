
-- 1) تعطيل الـ trigger القديم نهائياً
DROP TRIGGER IF EXISTS trg_auto_journal_payroll ON public.employee_payroll;

-- 2) أعمدة جديدة في employee_payroll
ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL;

-- 3) أعمدة في payroll_batches للدفع
ALTER TABLE public.payroll_batches
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text;

-- 4) حارس: منع تحديث is_paid أو status='paid' خارج RPC
--    نستخدم setting محلي على الجلسة `app.payroll_paying = on` يضعه الـ RPC فقط
CREATE OR REPLACE FUNCTION public.guard_employee_payroll_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inside_rpc text;
BEGIN
  v_inside_rpc := current_setting('app.payroll_paying', true);

  -- الانتقال إلى paid أو is_paid=true يجب أن يحدث حصراً عبر RPC
  IF (
    (NEW.status::text = 'paid' AND OLD.status::text <> 'paid')
    OR (NEW.is_paid IS TRUE AND (OLD.is_paid IS FALSE OR OLD.is_paid IS NULL))
  ) THEN
    IF v_inside_rpc IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'لا يمكن تعليم الراتب كمدفوع يدوياً. استخدم دالة الدفع الرسمية.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_payroll_payment ON public.employee_payroll;
CREATE TRIGGER trg_guard_employee_payroll_payment
BEFORE UPDATE ON public.employee_payroll
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_payroll_payment();

-- 5) دالة إنشاء سند صرف وقيد محاسبي لدفعة راتب واحدة (داخلية)
CREATE OR REPLACE FUNCTION public._payroll_post_payment(
  _payroll_id uuid,
  _payer uuid,
  _payment_method text,            -- 'cash' | 'bank' | 'cheque'
  _bank_account_id uuid,           -- لازم لو bank أو cheque (لاستخراج 1120/1160)
  _cheque_number text,             -- لازم لو cheque
  _cheque_due_date date,           -- لازم لو cheque
  _payment_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employee_payroll%ROWTYPE;
  _emp_name text;
  _credit_code text;
  _voucher_id uuid;
  _tx_id uuid;
  _voucher_subtype text;
  _ref text;
  _bank_row public.bank_accounts%ROWTYPE;
  _period text;
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

  -- تحديد حساب الجانب الدائن
  IF _payment_method = 'cash' THEN
    _credit_code := '1110';
    _voucher_subtype := 'cash';
  ELSIF _payment_method = 'bank' THEN
    IF _bank_account_id IS NULL THEN
      RAISE EXCEPTION 'يجب اختيار حساب بنكي للدفع البنكي';
    END IF;
    SELECT * INTO _bank_row FROM public.bank_accounts WHERE id = _bank_account_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'حساب البنك غير موجود'; END IF;
    _credit_code := COALESCE(_bank_row.gl_account_code, '1120');
    _voucher_subtype := 'bank';
  ELSIF _payment_method = 'cheque' THEN
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

  -- إنشاء القيد المحاسبي (Cash entry)
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

  -- ربط ووضع الحالة paid (نضع flag الجلسة لتمرير الحارس)
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

  -- ربط السند بالـ transaction
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
$$;

-- 6) RPC عام: دفع موظف واحد
CREATE OR REPLACE FUNCTION public.payroll_pay_employee(
  _payroll_id uuid,
  _payer uuid,
  _payment_method text,
  _bank_account_id uuid DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _payment_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._payroll_post_payment(
    _payroll_id, _payer, _payment_method,
    _bank_account_id, _cheque_number, _cheque_due_date,
    COALESCE(_payment_date, CURRENT_DATE)
  );
END;
$$;

-- 7) RPC عام: دفع دفعة كاملة لشهر معين
CREATE OR REPLACE FUNCTION public.payroll_pay_batch(
  _user_id uuid,
  _month integer,
  _year integer,
  _payer uuid,
  _payment_method text,
  _bank_account_id uuid DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _payment_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      _bank_account_id, _cheque_number, _cheque_due_date, _date
    );
    _count := _count + 1;
    SELECT _total + net_salary INTO _total FROM public.employee_payroll WHERE id = _id;
  END LOOP;

  -- تحديث payroll_batches
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
$$;

GRANT EXECUTE ON FUNCTION public.payroll_pay_employee(uuid, uuid, text, uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_pay_batch(uuid, integer, integer, uuid, text, uuid, text, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._payroll_post_payment(uuid, uuid, text, uuid, text, date, date) FROM PUBLIC;
