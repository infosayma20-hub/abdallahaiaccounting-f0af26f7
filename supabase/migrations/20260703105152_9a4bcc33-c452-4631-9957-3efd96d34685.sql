
-- Extend RPCs to allow super_admin to target a specific tenant via p_owner_id
CREATE OR REPLACE FUNCTION public.list_parent_account_transactions(
  p_only_missing_contact boolean DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
 RETURNS TABLE(id uuid, transaction_date date, description text, amount numeric, currency text, side text, parent_account_code text, parent_account_name text, other_account_code text, other_account_name text, contact_id uuid, contact_name text, transaction_type text, reference text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ctx AS (
    SELECT CASE
      WHEN p_owner_id IS NOT NULL AND public.is_super_admin(auth.uid()) THEN p_owner_id
      ELSE public.get_current_tenant_owner_id()
    END AS tenant
  ),
  parents AS (
    SELECT account_code, account_name
    FROM public.accounts, ctx
    WHERE account_code IN ('2110','2111','1130','1131')
      AND user_id = ctx.tenant
  ),
  base AS (
    SELECT t.*,
      CASE
        WHEN t.debit_account_code  IN (SELECT account_code FROM parents) THEN 'debit'
        WHEN t.credit_account_code IN (SELECT account_code FROM parents) THEN 'credit'
      END AS side_
    FROM public.transactions t, ctx
    WHERE t.is_deleted = false
      AND t.user_id = ctx.tenant
      AND (
        t.debit_account_code  IN (SELECT account_code FROM parents)
        OR t.credit_account_code IN (SELECT account_code FROM parents)
      )
  )
  SELECT
    b.id,
    b.transaction_date,
    b.description,
    b.amount,
    b.currency,
    b.side_ AS side,
    CASE WHEN b.side_ = 'debit'  THEN b.debit_account_code  ELSE b.credit_account_code END,
    (SELECT p.account_name FROM parents p WHERE p.account_code =
       CASE WHEN b.side_ = 'debit' THEN b.debit_account_code ELSE b.credit_account_code END),
    CASE WHEN b.side_ = 'debit'  THEN b.credit_account_code ELSE b.debit_account_code  END,
    (SELECT a.account_name FROM public.accounts a, ctx WHERE a.account_code =
       CASE WHEN b.side_ = 'debit' THEN b.credit_account_code ELSE b.debit_account_code END
       AND a.user_id = ctx.tenant LIMIT 1),
    b.contact_id,
    (SELECT c.contact_name FROM public.contacts c WHERE c.id = b.contact_id),
    b.transaction_type,
    b.reference
  FROM base b
  WHERE (p_only_missing_contact IS NULL)
     OR (p_only_missing_contact = true  AND b.contact_id IS NULL)
     OR (p_only_missing_contact = false AND b.contact_id IS NOT NULL)
  ORDER BY b.transaction_date DESC, b.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.search_leaf_accounts(
  p_query text DEFAULT NULL,
  p_parent_code text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_owner_id uuid DEFAULT NULL
)
 RETURNS TABLE(account_code text, account_name text, parent_code text, account_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ctx AS (
    SELECT CASE
      WHEN p_owner_id IS NOT NULL AND public.is_super_admin(auth.uid()) THEN p_owner_id
      ELSE public.get_current_tenant_owner_id()
    END AS tenant
  )
  SELECT a.account_code, a.account_name, a.parent_code, a.account_type
  FROM public.accounts a, ctx
  WHERE a.user_id = ctx.tenant
    AND a.is_active = true
    AND a.parent_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.accounts c
      WHERE c.parent_code = a.account_code
        AND c.user_id = a.user_id
    )
    AND (
      p_parent_code IS NULL
      OR a.parent_code = p_parent_code
      OR a.parent_code IN (SELECT account_code FROM public.accounts WHERE parent_code = p_parent_code AND user_id = a.user_id)
    )
    AND (
      p_query IS NULL OR p_query = ''
      OR a.account_code ILIKE '%' || p_query || '%'
      OR a.account_name ILIKE '%' || p_query || '%'
    )
  ORDER BY a.account_code
  LIMIT COALESCE(p_limit, 50);
$function$;

CREATE OR REPLACE FUNCTION public.reroute_parent_transaction(
  p_transaction_id uuid,
  p_new_account_code text,
  p_new_contact_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := CASE
    WHEN p_owner_id IS NOT NULL AND public.is_super_admin(auth.uid()) THEN p_owner_id
    ELSE public.get_current_tenant_owner_id()
  END;
  v_txn public.transactions%ROWTYPE;
  v_side text;
  v_old_code text;
  v_new_acc public.accounts%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يوجد سياق شركة نشط';
  END IF;

  SELECT * INTO v_txn FROM public.transactions
   WHERE id = p_transaction_id AND user_id = v_tenant AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحركة غير موجودة أو محذوفة';
  END IF;

  SELECT * INTO v_new_acc FROM public.accounts
   WHERE account_code = p_new_account_code AND user_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحساب الفرعي غير موجود: %', p_new_account_code;
  END IF;
  IF v_new_acc.parent_code IS NULL THEN
    RAISE EXCEPTION 'لا يمكن الترحيل إلى حساب رئيسي. يجب اختيار حساب فرعي.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounts WHERE parent_code = v_new_acc.account_code AND user_id = v_tenant) THEN
    RAISE EXCEPTION 'الحساب المختار له حسابات فرعية. اختر حساب فرعي نهائي.';
  END IF;

  IF v_txn.debit_account_code IN ('2110','2111','1130','1131') THEN
    v_side := 'debit';
    v_old_code := v_txn.debit_account_code;
  ELSIF v_txn.credit_account_code IN ('2110','2111','1130','1131') THEN
    v_side := 'credit';
    v_old_code := v_txn.credit_account_code;
  ELSE
    RAISE EXCEPTION 'هذه الحركة ليست على حساب أب — لا حاجة للتصحيح';
  END IF;

  IF v_side = 'debit' THEN
    UPDATE public.transactions
       SET debit_account_code = v_new_acc.account_code,
           account_id_debit   = v_new_acc.id,
           contact_id         = COALESCE(p_new_contact_id, contact_id),
           updated_at         = now()
     WHERE id = p_transaction_id;
  ELSE
    UPDATE public.transactions
       SET credit_account_code = v_new_acc.account_code,
           account_id_credit   = v_new_acc.id,
           contact_id          = COALESCE(p_new_contact_id, contact_id),
           updated_at          = now()
     WHERE id = p_transaction_id;
  END IF;

  INSERT INTO public.finance_integrity_fix_log
    (fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_by)
  VALUES
    ('manual_parent_reroute', 'transaction', p_transaction_id,
     jsonb_build_object('side', v_side, 'account_code', v_old_code, 'contact_id', v_txn.contact_id, 'tenant', v_tenant),
     jsonb_build_object('side', v_side, 'account_code', v_new_acc.account_code, 'contact_id', COALESCE(p_new_contact_id, v_txn.contact_id), 'tenant', v_tenant),
     'إعادة توجيه يدوية من حساب أب إلى حساب فرعي',
     auth.uid());

  RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id, 'new_code', v_new_acc.account_code, 'tenant', v_tenant);
END;
$function$;

-- Helper for super_admin: list all tenants with parent-account stuck counts
CREATE OR REPLACE FUNCTION public.list_tenants_with_parent_stuck()
 RETURNS TABLE(owner_id uuid, company_name text, stuck_count bigint, missing_contact bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.owner_id,
    c.name AS company_name,
    COUNT(t.id) AS stuck_count,
    COUNT(t.id) FILTER (WHERE t.contact_id IS NULL) AS missing_contact
  FROM public.companies c
  LEFT JOIN public.transactions t
    ON t.user_id = c.owner_id
   AND t.is_deleted = false
   AND (t.debit_account_code IN ('2110','2111','1130','1131')
     OR t.credit_account_code IN ('2110','2111','1130','1131'))
  WHERE public.is_super_admin(auth.uid())
  GROUP BY c.owner_id, c.name
  HAVING COUNT(t.id) > 0
  ORDER BY COUNT(t.id) DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_parent_account_transactions(boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_leaf_accounts(text, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reroute_parent_transaction(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenants_with_parent_stuck() TO authenticated;
