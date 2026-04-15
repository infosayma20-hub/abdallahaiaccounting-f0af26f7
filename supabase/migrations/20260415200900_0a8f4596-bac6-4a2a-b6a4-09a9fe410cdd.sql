
CREATE OR REPLACE FUNCTION public.create_reverse_entry(
  original_transaction_id uuid,
  reason text,
  reversed_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  orig public.transactions%ROWTYPE;
  new_id uuid;
BEGIN
  -- جلب القيد الأصلي
  SELECT * INTO orig 
  FROM public.transactions 
  WHERE id = original_transaction_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القيد غير موجود أو محذوف';
  END IF;
  
  -- منع العكس المزدوج
  IF EXISTS (
    SELECT 1 FROM public.transactions 
    WHERE reversed_by_id = original_transaction_id
  ) THEN
    RAISE EXCEPTION 'هذا القيد عُكس مسبقاً';
  END IF;

  -- إنشاء القيد العكسي
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
    orig.credit_account_code, orig.debit_account_code,
    orig.account_id_credit, orig.account_id_debit,
    orig.amount, orig.currency, 'reversal',
    'REV-' || COALESCE(orig.reference, orig.id::text),
    orig.contact_id, orig.payment_method,
    orig.foreign_amount, orig.exchange_rate,
    orig.cost_center_name, orig.workshop_id,
    original_transaction_id, reason, false
  )
  RETURNING id INTO new_id;

  -- soft-delete الأصلي للتوافق مع النظام الحالي
  UPDATE public.transactions 
  SET is_deleted = true,
      reversed_by_id = new_id
  WHERE id = original_transaction_id;

  RETURN new_id;
END;
$$;
