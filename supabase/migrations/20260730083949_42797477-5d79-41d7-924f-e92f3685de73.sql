CREATE OR REPLACE FUNCTION public.enforce_transaction_contact_subledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_linked_account public.accounts%ROWTYPE;
  v_debit_account public.accounts%ROWTYPE;
  v_credit_account public.accounts%ROWTYPE;
  v_linked_root text;
  v_debit_root text;
  v_credit_root text;
BEGIN
  IF NEW.contact_id IS NULL OR COALESCE(NEW.is_deleted, false) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_contact
  FROM public.contacts
  WHERE id = NEW.contact_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBLEDGER_CONTACT_TENANT_MISMATCH: جهة الاتصال لا تتبع نفس المشترك';
  END IF;

  IF v_contact.linked_account_code IS NULL OR btrim(v_contact.linked_account_code) = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_linked_account
  FROM public.accounts
  WHERE user_id = NEW.user_id
    AND account_code = v_contact.linked_account_code
    AND COALESCE(is_active, true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBLEDGER_LINKED_ACCOUNT_MISSING: حساب الذمة المرتبط بالجهة % غير موجود أو غير فعال', v_contact.contact_name;
  END IF;

  v_linked_root := CASE
    WHEN v_linked_account.parent_code IN ('1130','2110') THEN v_linked_account.parent_code
    WHEN v_contact.linked_account_code LIKE '113%' THEN '1130'
    WHEN v_contact.linked_account_code LIKE '211%' THEN '2110'
    ELSE v_linked_account.parent_code
  END;

  SELECT * INTO v_debit_account
  FROM public.accounts
  WHERE user_id = NEW.user_id AND account_code = NEW.debit_account_code;

  SELECT * INTO v_credit_account
  FROM public.accounts
  WHERE user_id = NEW.user_id AND account_code = NEW.credit_account_code;

  v_debit_root := CASE
    WHEN v_debit_account.parent_code IN ('1130','2110') THEN v_debit_account.parent_code
    WHEN NEW.debit_account_code IN ('1130','1131') THEN '1130'
    WHEN NEW.debit_account_code IN ('2110','2111') THEN '2110'
    ELSE NULL
  END;

  v_credit_root := CASE
    WHEN v_credit_account.parent_code IN ('1130','2110') THEN v_credit_account.parent_code
    WHEN NEW.credit_account_code IN ('1130','1131') THEN '1130'
    WHEN NEW.credit_account_code IN ('2110','2111') THEN '2110'
    ELSE NULL
  END;

  IF v_debit_root IS NOT NULL
     AND NEW.debit_account_code IS DISTINCT FROM v_contact.linked_account_code THEN
    IF v_debit_root IS DISTINCT FROM v_linked_root THEN
      RAISE EXCEPTION 'SUBLEDGER_ROOT_MISMATCH: جهة الاتصال % مرتبطة بـ % ولا يجوز ترحيلها على %',
        v_contact.contact_name, v_contact.linked_account_code, NEW.debit_account_code;
    END IF;

    INSERT INTO public.subledger_integrity_corrections
      (user_id, transaction_id, contact_id, side, old_account_code, corrected_account_code, details)
    VALUES
      (NEW.user_id, NEW.id, NEW.contact_id, 'debit', NEW.debit_account_code,
       v_contact.linked_account_code,
       jsonb_build_object('transaction_type', NEW.transaction_type, 'reference', NEW.reference,
                          'reason', 'shared_or_wrong_contact_subledger'));

    NEW.debit_account_code := v_contact.linked_account_code;
    NEW.account_id_debit := v_linked_account.id;
  ELSIF NEW.debit_account_code = v_contact.linked_account_code THEN
    NEW.account_id_debit := v_linked_account.id;
  END IF;

  IF v_credit_root IS NOT NULL
     AND NEW.credit_account_code IS DISTINCT FROM v_contact.linked_account_code THEN
    IF v_credit_root IS DISTINCT FROM v_linked_root THEN
      RAISE EXCEPTION 'SUBLEDGER_ROOT_MISMATCH: جهة الاتصال % مرتبطة بـ % ولا يجوز ترحيلها على %',
        v_contact.contact_name, v_contact.linked_account_code, NEW.credit_account_code;
    END IF;

    INSERT INTO public.subledger_integrity_corrections
      (user_id, transaction_id, contact_id, side, old_account_code, corrected_account_code, details)
    VALUES
      (NEW.user_id, NEW.id, NEW.contact_id, 'credit', NEW.credit_account_code,
       v_contact.linked_account_code,
       jsonb_build_object('transaction_type', NEW.transaction_type, 'reference', NEW.reference,
                          'reason', 'shared_or_wrong_contact_subledger'));

    NEW.credit_account_code := v_contact.linked_account_code;
    NEW.account_id_credit := v_linked_account.id;
  ELSIF NEW.credit_account_code = v_contact.linked_account_code THEN
    NEW.account_id_credit := v_linked_account.id;
  END IF;

  RETURN NEW;
END;
$$;