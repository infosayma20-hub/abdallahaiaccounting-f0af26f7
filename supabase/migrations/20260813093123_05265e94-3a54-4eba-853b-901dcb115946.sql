CREATE OR REPLACE FUNCTION public.wallet_post_gl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_liab text; v_cash text; v_card text; v_adj text;
  v_debit text; v_credit text; v_desc text; v_tx uuid;
BEGIN
  IF NEW.txn_type = 'spend' AND NEW.pos_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_liab := public.wallet_liability_account(NEW.user_id);

  SELECT gl_account_code INTO v_cash FROM public.cash_boxes
   WHERE user_id = NEW.user_id
     AND (NEW.branch_id IS NULL OR branch_id = NEW.branch_id)
     AND upper(COALESCE(currency,'ILS')) = 'ILS'
     AND COALESCE(is_active, true) = true
   ORDER BY created_at LIMIT 1;
  v_cash := COALESCE(v_cash, '1110');

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = NEW.user_id;
  v_card := COALESCE(v_card, '1120');

  IF NEW.txn_type IN ('topup','refund') THEN
    v_debit := CASE
      WHEN NEW.txn_type = 'topup' AND NEW.payment_method = 'card' THEN v_card
      WHEN NEW.txn_type = 'topup' AND NEW.payment_method = 'bank' THEN v_card
      ELSE v_cash END;
    v_credit := v_liab;
    v_desc := CASE WHEN NEW.txn_type = 'topup' THEN 'شحن محفظة زبون' ELSE 'إرجاع لمحفظة زبون' END;
  ELSIF NEW.txn_type = 'spend' THEN
    v_debit := v_liab; v_credit := v_cash;
    v_desc := 'سحب نقدي من محفظة زبون';
  ELSE
    v_adj := public.wallet_adjustment_account(NEW.user_id);
    IF NEW.direction > 0 THEN
      v_debit := v_adj; v_credit := v_liab;
    ELSE
      v_debit := v_liab; v_credit := v_adj;
    END IF;
    v_desc := 'تسوية محفظة زبون';
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id, reference, payment_method,
    idempotency_key, notes
  ) VALUES (
    NEW.user_id, CURRENT_DATE, v_desc || ' - ' || COALESCE(NEW.reference, NEW.id::text),
    v_debit, v_credit, NEW.amount, 'شيكل', 'wallet_' || NEW.txn_type, NEW.contact_id,
    COALESCE(NEW.reference, NEW.id::text), COALESCE(NEW.payment_method, 'wallet'),
    'WALLET-TXN-' || NEW.id::text, NEW.notes
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_tx;

  IF v_tx IS NULL THEN
    SELECT id INTO v_tx FROM public.transactions
     WHERE idempotency_key = 'WALLET-TXN-' || NEW.id::text LIMIT 1;
  END IF;

  IF v_tx IS NOT NULL THEN
    UPDATE public.wallet_transactions SET transaction_id = v_tx WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ربط الحركات القديمة
UPDATE public.wallet_transactions wt
   SET transaction_id = t.id
  FROM public.transactions t
 WHERE t.idempotency_key = 'WALLET-TXN-' || wt.id::text
   AND wt.transaction_id IS NULL;

-- حذف بيانات الفحص التجريبية
DELETE FROM public.transactions
 WHERE idempotency_key IN (
   SELECT 'WALLET-TXN-' || wt.id::text FROM public.wallet_transactions wt
    JOIN public.contacts c ON c.id = wt.contact_id
   WHERE c.contact_name = 'زبون تجريبي محفظة' AND c.phone = '0599000111');

DELETE FROM public.wallet_transactions wt
 USING public.contacts c
 WHERE c.id = wt.contact_id AND c.contact_name = 'زبون تجريبي محفظة' AND c.phone = '0599000111';

DELETE FROM public.customer_wallets w
 USING public.contacts c
 WHERE c.id = w.contact_id AND c.contact_name = 'زبون تجريبي محفظة' AND c.phone = '0599000111';

DELETE FROM public.contacts
 WHERE contact_name = 'زبون تجريبي محفظة' AND phone = '0599000111';