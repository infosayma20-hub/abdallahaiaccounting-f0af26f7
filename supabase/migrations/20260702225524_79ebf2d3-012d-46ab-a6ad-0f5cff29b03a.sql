-- ============================================================================
-- PHASE 1: FINANCIAL INTEGRITY GUARDRAILS (SAFE, NON-BREAKING)
-- ============================================================================

-- 1) Harden ref_number generator with advisory lock (prevents future duplicates)
--    We keep the same signature/logic, only add a per-(user,type) transaction lock.
CREATE OR REPLACE FUNCTION public.generate_voucher_ref_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_year TEXT;
  v_next INT;
  v_lock_key BIGINT;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number <> '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.type
    WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PV'
    WHEN 'journal' THEN 'QV'
    ELSE 'V'
  END;
  v_year := to_char(COALESCE(NEW.created_at, now()), 'YYYY');

  -- Serialize concurrent inserts for same (user,type) within the transaction
  v_lock_key := ('x' || substr(md5(NEW.user_id::text || '|' || NEW.type), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(ref_number, '^[A-Z]+-\d{4}-', ''), '')::int), 0) + 1
    INTO v_next
    FROM public.vouchers
   WHERE user_id = NEW.user_id
     AND type = NEW.type
     AND ref_number ~ ('^' || v_prefix || '-' || v_year || '-\d+$');

  NEW.ref_number := v_prefix || '-' || v_year || '-' || LPAD(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;

-- 2) Foreign keys with ON DELETE SET NULL (0 orphans verified beforehand)
ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_linked_transaction_id_fkey;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_linked_transaction_id_fkey
  FOREIGN KEY (linked_transaction_id)
  REFERENCES public.transactions(id)
  ON DELETE SET NULL;

ALTER TABLE public.receipt_vouchers
  DROP CONSTRAINT IF EXISTS receipt_vouchers_linked_transaction_id_fkey;
ALTER TABLE public.receipt_vouchers
  ADD CONSTRAINT receipt_vouchers_linked_transaction_id_fkey
  FOREIGN KEY (linked_transaction_id)
  REFERENCES public.transactions(id)
  ON DELETE SET NULL;

ALTER TABLE public.cash_transfers
  DROP CONSTRAINT IF EXISTS cash_transfers_voucher_id_fkey;
ALTER TABLE public.cash_transfers
  ADD CONSTRAINT cash_transfers_voucher_id_fkey
  FOREIGN KEY (voucher_id)
  REFERENCES public.vouchers(id)
  ON DELETE SET NULL;

-- 3) Deferrable constraint trigger: enforce SUM(debit)=SUM(credit) per voucher
--    Fires at COMMIT so multi-line inserts within one transaction succeed.
CREATE OR REPLACE FUNCTION public.enforce_voucher_lines_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_voucher_id UUID;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_status TEXT;
BEGIN
  v_voucher_id := COALESCE(NEW.voucher_id, OLD.voucher_id);
  IF v_voucher_id IS NULL THEN RETURN NULL; END IF;

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_voucher_id;
  -- Only enforce on posted vouchers; drafts may be mid-edit
  IF v_status IS DISTINCT FROM 'posted' THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM public.voucher_lines
   WHERE voucher_id = v_voucher_id;

  IF ABS(v_debit - v_credit) > 0.01 THEN
    RAISE EXCEPTION 'Voucher % is unbalanced: debit=% credit=%', v_voucher_id, v_debit, v_credit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_lines_balanced ON public.voucher_lines;
CREATE CONSTRAINT TRIGGER trg_voucher_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voucher_lines_balanced();

-- 4) Unique receipt_number per user (0 duplicates verified)
CREATE UNIQUE INDEX IF NOT EXISTS ux_receipt_vouchers_user_receipt_number
  ON public.receipt_vouchers(user_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

-- 5) Diagnostic view: financial integrity issues (READ-ONLY)
CREATE OR REPLACE VIEW public.v_financial_integrity_issues
WITH (security_invoker=on) AS
-- Cancelled vouchers whose linked transaction is still live in the ledger
SELECT
  'cancelled_voucher_live_tx' AS issue_type,
  v.user_id,
  v.id AS document_id,
  v.ref_number AS document_ref,
  v.type AS document_kind,
  v.linked_transaction_id AS transaction_id,
  v.amount,
  v.created_at,
  'السند ملغى لكن قيده لا يزال ظاهراً في كشف الحساب' AS description
FROM public.vouchers v
JOIN public.transactions t ON t.id = v.linked_transaction_id
WHERE v.status = 'cancelled' AND COALESCE(t.is_deleted, false) = false

UNION ALL
SELECT
  'cancelled_receipt_live_tx',
  rv.user_id,
  rv.id,
  rv.receipt_number,
  'receipt'::text,
  rv.linked_transaction_id,
  rv.amount,
  rv.created_at,
  'سند قبض ملغى لكن قيده لا يزال ظاهراً في كشف الحساب'
FROM public.receipt_vouchers rv
JOIN public.transactions t ON t.id = rv.linked_transaction_id
WHERE rv.status = 'cancelled' AND COALESCE(t.is_deleted, false) = false

UNION ALL
-- Posted vouchers without a linked transaction
SELECT
  'posted_voucher_no_link',
  v.user_id,
  v.id,
  v.ref_number,
  v.type,
  NULL::uuid,
  v.amount,
  v.created_at,
  'سند مرحّل بدون قيد مرتبط في الأستاذ'
FROM public.vouchers v
WHERE v.status = 'posted' AND v.linked_transaction_id IS NULL

UNION ALL
SELECT
  'posted_receipt_no_link',
  rv.user_id,
  rv.id,
  rv.receipt_number,
  'receipt'::text,
  NULL::uuid,
  rv.amount,
  rv.created_at,
  'سند قبض مرحّل بدون قيد مرتبط في الأستاذ'
FROM public.receipt_vouchers rv
WHERE rv.status = 'posted' AND rv.linked_transaction_id IS NULL

UNION ALL
-- Unbalanced posted vouchers
SELECT
  'unbalanced_voucher',
  v.user_id,
  v.id,
  v.ref_number,
  v.type,
  v.linked_transaction_id,
  vl.debit_sum,
  v.created_at,
  'قيد غير متوازن (مدين ≠ دائن): مدين=' || vl.debit_sum || ' دائن=' || vl.credit_sum
FROM public.vouchers v
JOIN LATERAL (
  SELECT COALESCE(SUM(debit),0) debit_sum, COALESCE(SUM(credit),0) credit_sum
  FROM public.voucher_lines WHERE voucher_id = v.id
) vl ON true
WHERE v.status = 'posted' AND ABS(vl.debit_sum - vl.credit_sum) > 0.01;

GRANT SELECT ON public.v_financial_integrity_issues TO authenticated, service_role;

-- 6) Diagnostic view: duplicate voucher ref_numbers (for Phase 2 cleanup)
CREATE OR REPLACE VIEW public.v_duplicate_voucher_refs
WITH (security_invoker=on) AS
SELECT
  user_id,
  type,
  ref_number,
  COUNT(*) AS duplicate_count,
  MIN(created_at) AS first_created,
  MAX(created_at) AS last_created,
  array_agg(id ORDER BY created_at) AS voucher_ids,
  array_agg(status ORDER BY created_at) AS statuses
FROM public.vouchers
WHERE ref_number IS NOT NULL
GROUP BY user_id, type, ref_number
HAVING COUNT(*) > 1;

GRANT SELECT ON public.v_duplicate_voucher_refs TO authenticated, service_role;

COMMENT ON VIEW public.v_financial_integrity_issues IS
  'المرحلة 1: تقرير للقراءة فقط يعرض حالات الانحراف بين السندات والقيود المحاسبية';
COMMENT ON VIEW public.v_duplicate_voucher_refs IS
  'المرحلة 1: تقرير الأرقام المكررة في السندات — خطة تنظيف المرحلة 2';
COMMENT ON FUNCTION public.generate_voucher_ref_number() IS
  'مولّد رقم السند مع قفل متزامن لمنع التكرار (المرحلة 1)';
