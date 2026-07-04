
-- Guard: prevent card payments from being posted to cash-box GL accounts.
-- This protects against silent fallback where a missing visa_gl_account_code
-- caused card revenue to be debited to the shift's cash box (inflating cash,
-- hiding card receivables). Cash boxes are identified by cash_boxes.gl_account_code.

CREATE OR REPLACE FUNCTION public._guard_card_not_to_cash_box()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_name TEXT;
BEGIN
  IF NEW.payment_method = 'card'
     AND NEW.debit_account_code IS NOT NULL
     AND COALESCE(NEW.is_deleted, false) = false THEN
    SELECT name INTO v_box_name
    FROM public.cash_boxes
    WHERE user_id = NEW.user_id
      AND gl_account_code = NEW.debit_account_code
    LIMIT 1;

    IF v_box_name IS NOT NULL THEN
      RAISE EXCEPTION
        'قيد بطاقة مرفوض: لا يجوز ترحيل مبلغ دفعة بطاقة إلى حساب صندوق نقدي (%). الرجاء ربط حساب بنك/فيزا صحيح قبل إتمام العملية.',
        v_box_name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_card_not_to_cash_box ON public.transactions;
CREATE TRIGGER trg_guard_card_not_to_cash_box
BEFORE INSERT OR UPDATE OF debit_account_code, payment_method ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public._guard_card_not_to_cash_box();
