CREATE OR REPLACE FUNCTION public.allocate_document_number(
  p_user_id uuid,
  p_doc_type text,
  p_prefix text DEFAULT '',
  p_year integer DEFAULT NULL,
  p_pad integer DEFAULT 4
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
  v_next integer;
  v_existing_max integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_user_id IS NULL OR p_doc_type IS NULL OR btrim(p_doc_type) = '' THEN
    RAISE EXCEPTION 'allocate_document_number: user_id and doc_type are required';
  END IF;
  IF p_user_id <> auth.uid() AND p_user_id <> public.get_team_owner_id() THEN
    RAISE EXCEPTION 'not allowed to allocate numbers for another account';
  END IF;

  IF p_doc_type = 'payment_voucher' THEN
    SELECT COALESCE(MAX((substring(ref_number from '([0-9]+)$'))::integer), 0)
      INTO v_existing_max
      FROM public.vouchers
     WHERE user_id = p_user_id
       AND type = 'payment'
       AND ref_number LIKE 'PV-' || v_year::text || '-%'
       AND ref_number ~ '[0-9]+$';
  ELSIF p_doc_type = 'receipt_voucher' THEN
    SELECT COALESCE(MAX((substring(receipt_number from '([0-9]+)$'))::integer), 0)
      INTO v_existing_max
      FROM public.receipt_vouchers
     WHERE user_id = p_user_id
       AND receipt_number LIKE 'REC-' || v_year::text || '-%'
       AND receipt_number ~ '[0-9]+$';
  END IF;

  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (p_user_id, p_doc_type, v_year, v_existing_max + 1)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = GREATEST(document_sequences.last_number + 1, v_existing_max + 1),
                updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN COALESCE(p_prefix, '') || lpad(v_next::text, GREATEST(COALESCE(p_pad, 4), 1), '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_document_number(uuid, text, text, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.allocate_document_number(uuid, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_basic_voucher_atomic(
  p_user_id uuid,
  p_kind text,
  p_reference text,
  p_voucher_date date,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_amount_ils numeric,
  p_currency text,
  p_exchange_rate numeric,
  p_payment_method text,
  p_description text,
  p_notes text,
  p_cash_account_code text,
  p_counter_account_code text,
  p_cash_box_id uuid DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL,
  p_workshop_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem text;
  v_tx_id uuid;
  v_voucher_id uuid;
  v_existing_deleted boolean;
  v_reference text;
  v_method text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول لحفظ السند';
  END IF;
  IF p_user_id IS NULL OR (p_user_id <> auth.uid() AND p_user_id <> public.get_team_owner_id()) THEN
    RAISE EXCEPTION 'لا تملك صلاحية إنشاء سند لهذه الشركة';
  END IF;
  IF p_kind NOT IN ('payment', 'receipt') THEN
    RAISE EXCEPTION 'نوع السند غير صالح';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount_ils IS NULL OR p_amount_ils <= 0 THEN
    RAISE EXCEPTION 'مبلغ السند يجب أن يكون أكبر من صفر';
  END IF;
  IF p_contact_id IS NULL OR p_cash_account_code IS NULL OR p_counter_account_code IS NULL THEN
    RAISE EXCEPTION 'بيانات الجهة والحسابات غير مكتملة';
  END IF;

  v_reference := NULLIF(btrim(p_reference), '');
  IF v_reference IS NULL THEN
    v_reference := CASE WHEN p_kind = 'payment' THEN 'PV-' ELSE 'REC-' END
      || EXTRACT(YEAR FROM COALESCE(p_voucher_date, CURRENT_DATE))::integer::text || '-'
      || public.allocate_document_number(
           p_user_id,
           CASE WHEN p_kind = 'payment' THEN 'payment_voucher' ELSE 'receipt_voucher' END,
           '',
           EXTRACT(YEAR FROM COALESCE(p_voucher_date, CURRENT_DATE))::integer,
           4
         );
  END IF;
  v_idem := COALESCE(NULLIF(btrim(p_idempotency_key), ''), upper(substr(p_kind, 1, 3)) || '-' || v_reference);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_idem, 0));

  SELECT t.id, COALESCE(t.is_deleted, false)
    INTO v_tx_id, v_existing_deleted
    FROM public.transactions t
   WHERE t.user_id = p_user_id AND t.idempotency_key = v_idem
   LIMIT 1;

  IF v_tx_id IS NOT NULL AND NOT v_existing_deleted THEN
    IF p_kind = 'payment' THEN
      SELECT id INTO v_voucher_id FROM public.vouchers
       WHERE user_id = p_user_id AND linked_transaction_id = v_tx_id AND status <> 'cancelled' LIMIT 1;
    ELSE
      SELECT id INTO v_voucher_id FROM public.receipt_vouchers
       WHERE user_id = p_user_id AND linked_transaction_id = v_tx_id AND status <> 'cancelled' LIMIT 1;
    END IF;
    IF v_voucher_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'voucher_id', v_voucher_id, 'transaction_id', v_tx_id, 'reference', v_reference);
    END IF;
    RAISE EXCEPTION 'وجد قيد محاسبي قائم بلا سند مرتبط؛ لم يتم إنشاء نسخة أخرى';
  ELSIF v_tx_id IS NOT NULL AND v_existing_deleted THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vouchers WHERE linked_transaction_id = v_tx_id
      UNION ALL
      SELECT 1 FROM public.receipt_vouchers WHERE linked_transaction_id = v_tx_id
    ) THEN
      UPDATE public.transactions SET idempotency_key = NULL WHERE id = v_tx_id;
    ELSE
      RAISE EXCEPTION 'المحاولة السابقة ملغاة ومرتبطة بسند محفوظ؛ ابدأ سنداً جديداً';
    END IF;
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, p_cash_account_code);
  PERFORM public._fc_validate_postable_account(p_user_id, p_counter_account_code);

  INSERT INTO public.transactions (
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id, payment_method, idempotency_key,
    reference, foreign_amount, exchange_rate, workshop_id, cost_center_id, notes
  ) VALUES (
    p_user_id, COALESCE(p_voucher_date, CURRENT_DATE), p_description,
    CASE WHEN p_kind = 'payment' THEN p_counter_account_code ELSE p_cash_account_code END,
    CASE WHEN p_kind = 'payment' THEN p_cash_account_code ELSE p_counter_account_code END,
    p_amount_ils, COALESCE(p_currency, 'شيكل'), p_kind, p_contact_id, p_payment_method,
    v_idem, v_reference,
    CASE WHEN COALESCE(p_currency, 'ILS') NOT IN ('ILS', 'شيكل') THEN p_amount ELSE NULL END,
    CASE WHEN COALESCE(p_currency, 'ILS') NOT IN ('ILS', 'شيكل') THEN p_exchange_rate ELSE NULL END,
    p_workshop_id, p_cost_center_id, p_notes
  ) RETURNING id INTO v_tx_id;

  IF p_kind = 'payment' THEN
    v_method := CASE p_payment_method WHEN 'نقدي' THEN 'cash' WHEN 'تحويل' THEN 'transfer' WHEN 'بطاقة' THEN 'card' ELSE lower(p_payment_method) END;
    INSERT INTO public.vouchers (
      user_id, type, ref_number, date, contact_id, payment_method, amount, amount_ils,
      currency, exchange_rate, description, notes, status, linked_transaction_id,
      bank_account_id, cash_box_id, posted_by, posted_at, workshop_id, cost_center_id
    ) VALUES (
      p_user_id, 'payment', v_reference, COALESCE(p_voucher_date, CURRENT_DATE), p_contact_id,
      v_method, p_amount, p_amount_ils, COALESCE(p_currency, 'ILS'), p_exchange_rate,
      p_description, p_notes, 'posted', v_tx_id, p_bank_account_id, p_cash_box_id,
      auth.uid(), now(), p_workshop_id, p_cost_center_id
    ) RETURNING id INTO v_voucher_id;
  ELSE
    INSERT INTO public.receipt_vouchers (
      user_id, receipt_number, contact_id, contact_name, payment_date, amount,
      payment_method, cash_box_id, bank_account_id, deposit_account_code, notes,
      status, linked_transaction_id, workshop_id
    ) VALUES (
      p_user_id, v_reference, p_contact_id, p_contact_name, COALESCE(p_voucher_date, CURRENT_DATE),
      p_amount, p_payment_method, p_cash_box_id, p_bank_account_id, p_cash_account_code,
      p_notes, 'posted', v_tx_id, p_workshop_id
    ) RETURNING id INTO v_voucher_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'voucher_id', v_voucher_id, 'transaction_id', v_tx_id, 'reference', v_reference);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'تعذر الحفظ بسبب تعارض متزامن على رقم السند؛ أعد المحاولة وسيُخصص رقم جديد تلقائياً';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_basic_voucher_atomic(uuid,text,text,date,uuid,text,numeric,numeric,text,numeric,text,text,text,text,text,uuid,uuid,uuid,uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_basic_voucher_atomic(uuid,text,text,date,uuid,text,numeric,numeric,text,numeric,text,text,text,text,text,uuid,uuid,uuid,uuid,text) TO authenticated;
COMMENT ON FUNCTION public.create_basic_voucher_atomic(uuid,text,text,date,uuid,text,numeric,numeric,text,numeric,text,text,text,text,text,uuid,uuid,uuid,uuid,text) IS 'Atomically creates a basic contact voucher and its accounting transaction with tenant validation and idempotent retry handling.';