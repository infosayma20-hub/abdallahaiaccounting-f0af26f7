CREATE TABLE public.subledger_integrity_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_id uuid,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  side text NOT NULL CHECK (side IN ('debit','credit')),
  old_account_code text NOT NULL,
  corrected_account_code text NOT NULL,
  correction_source text NOT NULL DEFAULT 'database_guard',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subledger_integrity_corrections TO authenticated;
GRANT ALL ON public.subledger_integrity_corrections TO service_role;

ALTER TABLE public.subledger_integrity_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view subledger corrections"
ON public.subledger_integrity_corrections
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR user_id = public.resolve_effective_owner_id(auth.uid())
);

CREATE INDEX idx_subledger_corrections_user_date
ON public.subledger_integrity_corrections (user_id, corrected_at DESC);

CREATE INDEX idx_subledger_corrections_transaction
ON public.subledger_integrity_corrections (transaction_id)
WHERE transaction_id IS NOT NULL;

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

  v_linked_root := v_linked_account.parent_code;

  SELECT * INTO v_debit_account
  FROM public.accounts
  WHERE user_id = NEW.user_id AND account_code = NEW.debit_account_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBLEDGER_DEBIT_ACCOUNT_MISSING: حساب المدين % غير موجود للمشترك', NEW.debit_account_code;
  END IF;

  SELECT * INTO v_credit_account
  FROM public.accounts
  WHERE user_id = NEW.user_id AND account_code = NEW.credit_account_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBLEDGER_CREDIT_ACCOUNT_MISSING: حساب الدائن % غير موجود للمشترك', NEW.credit_account_code;
  END IF;

  IF v_debit_account.parent_code IN ('1130','2110')
     AND NEW.debit_account_code IS DISTINCT FROM v_contact.linked_account_code THEN
    IF v_debit_account.parent_code IS DISTINCT FROM v_linked_root THEN
      RAISE EXCEPTION 'SUBLEDGER_ROOT_MISMATCH: جهة الاتصال % مرتبطة بـ % ولا يجوز ترحيلها على %',
        v_contact.contact_name, v_contact.linked_account_code, NEW.debit_account_code;
    END IF;

    INSERT INTO public.subledger_integrity_corrections
      (user_id, transaction_id, contact_id, side, old_account_code, corrected_account_code, details)
    VALUES
      (NEW.user_id, NEW.id, NEW.contact_id, 'debit', NEW.debit_account_code,
       v_contact.linked_account_code,
       jsonb_build_object('transaction_type', NEW.transaction_type, 'reference', NEW.reference));

    NEW.debit_account_code := v_contact.linked_account_code;
    NEW.account_id_debit := v_linked_account.id;
  ELSIF NEW.debit_account_code = v_contact.linked_account_code THEN
    NEW.account_id_debit := v_linked_account.id;
  END IF;

  IF v_credit_account.parent_code IN ('1130','2110')
     AND NEW.credit_account_code IS DISTINCT FROM v_contact.linked_account_code THEN
    IF v_credit_account.parent_code IS DISTINCT FROM v_linked_root THEN
      RAISE EXCEPTION 'SUBLEDGER_ROOT_MISMATCH: جهة الاتصال % مرتبطة بـ % ولا يجوز ترحيلها على %',
        v_contact.contact_name, v_contact.linked_account_code, NEW.credit_account_code;
    END IF;

    INSERT INTO public.subledger_integrity_corrections
      (user_id, transaction_id, contact_id, side, old_account_code, corrected_account_code, details)
    VALUES
      (NEW.user_id, NEW.id, NEW.contact_id, 'credit', NEW.credit_account_code,
       v_contact.linked_account_code,
       jsonb_build_object('transaction_type', NEW.transaction_type, 'reference', NEW.reference));

    NEW.credit_account_code := v_contact.linked_account_code;
    NEW.account_id_credit := v_linked_account.id;
  ELSIF NEW.credit_account_code = v_contact.linked_account_code THEN
    NEW.account_id_credit := v_linked_account.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_transaction_contact_subledger ON public.transactions;
CREATE TRIGGER trg_enforce_transaction_contact_subledger
BEFORE INSERT OR UPDATE OF user_id, contact_id, debit_account_code, credit_account_code, account_id_debit, account_id_credit, is_deleted
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_transaction_contact_subledger();