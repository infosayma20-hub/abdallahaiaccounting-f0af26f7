CREATE OR REPLACE FUNCTION public._currency_code_label(_c text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _c WHEN 'USD' THEN 'الدولار' WHEN 'JOD' THEN 'الدينار' WHEN 'EUR' THEN 'اليورو' WHEN 'EGP' THEN 'الجنيه' WHEN 'ILS' THEN 'الشيكل' ELSE _c END
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
    RAISE EXCEPTION 'لا يمكن قيد مباشر بين حسابين بعملتين مختلفتين («%» و«%»). استخدم شاشة صرف العملات.', v_dn, v_cn
      USING ERRCODE = 'P0001', HINT = 'foreign_currency_mismatch';
  END IF;

  v_tx := public._currency_label_to_code(NEW.currency);
  IF v_dc <> 'ILS' AND (v_tx <> v_dc OR COALESCE(NEW.foreign_amount,0) <= 0) THEN
    RAISE EXCEPTION 'الحساب «%» عملته %، اختر عملة % في السند وأدخل المبلغ بها.', v_dn, public._currency_code_label(v_dc), public._currency_code_label(v_dc)
      USING ERRCODE = 'P0001', HINT = 'foreign_currency_required';
  END IF;
  IF v_cc <> 'ILS' AND (v_tx <> v_cc OR COALESCE(NEW.foreign_amount,0) <= 0) THEN
    RAISE EXCEPTION 'الحساب «%» عملته %، اختر عملة % في السند وأدخل المبلغ بها.', v_cn, public._currency_code_label(v_cc), public._currency_code_label(v_cc)
      USING ERRCODE = 'P0001', HINT = 'foreign_currency_required';
  END IF;
  RETURN NEW;
END $$;