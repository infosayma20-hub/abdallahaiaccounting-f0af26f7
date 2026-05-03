CREATE OR REPLACE FUNCTION public.create_reverse_entry(original_transaction_id uuid, reason text, reversed_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  orig public.transactions%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO orig FROM public.transactions WHERE id = original_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القيد غير موجود';
  END IF;
  IF orig.is_deleted THEN
    RAISE EXCEPTION 'لا يمكن عكس قيد محذوف';
  END IF;

  -- منع العكس المزدوج
  IF EXISTS (SELECT 1 FROM public.transactions WHERE reversed_by_id = original_transaction_id AND is_deleted = false) THEN
    RAISE EXCEPTION 'هذا القيد عُكس مسبقاً';
  END IF;

  -- Fail-safe: تأكد أن الأصلي يحوي طرفي القيد
  IF orig.debit_account_code IS NULL OR orig.credit_account_code IS NULL
     OR orig.amount IS NULL OR orig.amount = 0 THEN
    RAISE EXCEPTION 'القيد الأصلي ناقص: لا يمكن عمل mirror reverse';
  END IF;

  -- Mirror entry: نفس الحسابات، Dr↔Cr، نفس القيمة
  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    account_id_debit, account_id_credit,
    amount, currency, transaction_type,
    reference, contact_id, payment_method,
    foreign_amount, exchange_rate,
    cost_center_name, workshop_id,
    reversed_by_id, notes, is_deleted
  )
  VALUES (
    orig.user_id, CURRENT_DATE,
    'عكس قيد: ' || orig.description || ' — ' || reason,
    orig.credit_account_code, orig.debit_account_code,    -- mirror
    orig.account_id_credit,   orig.account_id_debit,      -- mirror ids
    orig.amount, orig.currency, 'reversal',
    'REV-' || COALESCE(orig.reference, orig.id::text),
    orig.contact_id, orig.payment_method,
    orig.foreign_amount, orig.exchange_rate,
    orig.cost_center_name, orig.workshop_id,
    original_transaction_id, reason, false
  )
  RETURNING id INTO new_id;

  -- ✅ لا نضع is_deleted على الأصلي — يبقى نشطاً ليظهر مع العكسي ويلغيه
  -- نسجل فقط الربط reversed_by_id للتدقيق
  UPDATE public.transactions
     SET reversed_by_id = new_id
   WHERE id = original_transaction_id;

  RETURN new_id;
END;
$function$;