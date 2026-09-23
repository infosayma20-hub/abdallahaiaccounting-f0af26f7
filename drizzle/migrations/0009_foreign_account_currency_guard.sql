-- Currency control: a manual journal line that touches a foreign-currency
-- account must carry that account's currency and its native amount.
-- System flows (POS, transfers, exchange, revaluation, reversals) are untouched.
CREATE OR REPLACE FUNCTION public._currency_label_to_code(_c text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(trim(coalesce(_c,'')))
    WHEN '' THEN 'ILS' WHEN 'ILS' THEN 'ILS' WHEN 'شيكل' THEN 'ILS'
    WHEN 'USD' THEN 'USD' WHEN 'دولار' THEN 'USD'
    WHEN 'JOD' THEN 'JOD' WHEN 'دينار' THEN 'JOD'
    WHEN 'EUR' THEN 'EUR' WHEN 'يورو' THEN 'EUR'
    WHEN 'EGP' THEN 'EGP' WHEN 'جنيه' THEN 'EGP'
    ELSE upper(trim(_c)) END
$$;

CREATE OR REPLACE FUNCTION public.guard_manual_journal_foreign_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dc text; v_cc text; v_dn text; v_cn text; v_tx text;
BEGIN
  IF COALESCE(NEW.transaction_type,'') NOT IN ('manual_journal','journal') OR COALESCE(NEW.is_deleted,false) THEN
    RETURN NEW;
  END IF;

  SELECT public._currency_label_to_code(currency), account_name INTO v_dc, v_dn
    FROM public.accounts WHERE user_id = NEW.user_id AND account_code = NEW.debit_account_code LIMIT 1;
  SELECT public._currency_label_to_code(currency), account_name INTO v_cc, v_cn
    FROM public.accounts WHERE user_id = NEW.user_id AND account_code = NEW.credit_account_code LIMIT 1;
  v_dc := COALESCE(v_dc,'ILS'); v_cc := COALESCE(v_cc,'ILS');

  IF v_dc = 'ILS' AND v_cc = 'ILS' THEN RETURN NEW; END IF;

  IF v_dc <> 'ILS' AND v_cc <> 'ILS' AND v_dc <> v_cc THEN
    RAISE EXCEPTION 'لا يمكن قيد مباشر بين حسابين بعملتين مختلفتين (% و %). استخدم شاشة صرف العملات.', v_dn, v_cn
      USING ERRCODE = 'P0001', HINT = 'foreign_currency_mismatch';
  END IF;

  v_tx := public._currency_label_to_code(NEW.currency);
  IF v_dc <> 'ILS' AND (v_tx <> v_dc OR COALESCE(NEW.foreign_amount,0) <= 0) THEN
    RAISE EXCEPTION 'الحساب «%» عملته % — اختر نفس العملة في السند وأدخل المبلغ بها.', v_dn, v_dc
      USING ERRCODE = 'P0001', HINT = 'foreign_currency_required';
  END IF;
  IF v_cc <> 'ILS' AND (v_tx <> v_cc OR COALESCE(NEW.foreign_amount,0) <= 0) THEN
    RAISE EXCEPTION 'الحساب «%» عملته % — اختر نفس العملة في السند وأدخل المبلغ بها.', v_cn, v_cc
      USING ERRCODE = 'P0001', HINT = 'foreign_currency_required';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_manual_journal_foreign_currency ON public.transactions;
CREATE TRIGGER trg_guard_manual_journal_foreign_currency
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_manual_journal_foreign_currency();

-- Native balance = only lines carrying the box's own currency (parity with the UI helper).
CREATE OR REPLACE FUNCTION public.get_cash_box_native_balances(p_owner uuid)
 RETURNS TABLE(account_code text, balance_ils numeric, balance_foreign numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH boxes AS (
    SELECT gl_account_code, public._currency_label_to_code(max(currency)) AS cur
    FROM public.cash_boxes
    WHERE user_id = p_owner AND gl_account_code IS NOT NULL
    GROUP BY gl_account_code
  )
  SELECT
    b.gl_account_code,
    COALESCE(SUM(CASE WHEN t.debit_account_code  = b.gl_account_code THEN t.amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.credit_account_code = b.gl_account_code THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.debit_account_code  = b.gl_account_code AND public._currency_label_to_code(t.currency) = b.cur THEN COALESCE(t.foreign_amount, 0) ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.credit_account_code = b.gl_account_code AND public._currency_label_to_code(t.currency) = b.cur THEN COALESCE(t.foreign_amount, 0) ELSE 0 END), 0)
  FROM boxes b
  LEFT JOIN public.transactions t
    ON t.user_id = p_owner AND t.is_deleted = false
   AND (t.debit_account_code = b.gl_account_code OR t.credit_account_code = b.gl_account_code)
  GROUP BY b.gl_account_code;
$function$;