
-- ============================================================
-- Smart Accountant — Phase 3: COA gap-fill helper + live wrapper
-- ============================================================

-- 1) Idempotent gap-fill helper (per tenant, opt-in)
CREATE OR REPLACE FUNCTION public.sa_ensure_baseline_accounts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_added text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      -- code, name_ar, account_type, nature, system_role
      ('1310','مخزون مواد خام',                  'أصول متداولة',  'debit',  'raw_materials_inventory'),
      ('1320','إنتاج تحت التشغيل',                'أصول متداولة',  'debit',  'wip'),
      ('1330','بضاعة تامة الصنع',                 'أصول متداولة',  'debit',  'finished_goods'),
      ('3120','مسحوبات شخصية',                    'حقوق ملكية',    'debit',  'owner_drawings'),
      ('6000','مصاريف توصيل',                     'مصاريف',        'debit',  'delivery_expense'),
      ('6400','مصاريف تسويق وإعلان',              'مصاريف',        'debit',  'marketing_expense'),
      ('6500','مصاريف تمويلية وفوائد',            'مصاريف',        'debit',  'finance_expense'),
      ('6900','مصاريف متفرقة',                    'مصاريف',        'debit',  'misc_expense')
    ) AS t(code, nm, atype, nat, srole)
  LOOP
    IF EXISTS (SELECT 1 FROM public.accounts a
                WHERE a.user_id = p_user_id AND a.account_code = v_row.code) THEN
      v_skipped := v_skipped || v_row.code;
    ELSE
      INSERT INTO public.accounts
        (user_id, account_code, account_name, account_type, parent_code,
         nature, currency, system_role, is_active, is_system)
      VALUES
        (p_user_id, v_row.code, v_row.nm, v_row.atype, NULL,
         v_row.nat, 'شيكل', v_row.srole, true, false);
      v_added := v_added || v_row.code;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'added', v_added,
    'skipped_existing', v_skipped,
    'added_count', cardinality(v_added),
    'skipped_count', cardinality(v_skipped)
  );
END;
$$;

COMMENT ON FUNCTION public.sa_ensure_baseline_accounts(uuid) IS
$c$Idempotent COA gap-fill for the 8 baseline accounts the Smart Accountant resolver
needs but most tenants lack (1310/1320/1330/3120/6000/6400/6500/6900). Safe to re-run.
Does NOT touch existing accounts. Opt-in per tenant — never auto-executed.$c$;

GRANT EXECUTE ON FUNCTION public.sa_ensure_baseline_accounts(uuid) TO authenticated;

-- 2) Live posting wrapper — explicit, no chance of dry_run misfire
CREATE OR REPLACE FUNCTION public.sa_post_journal_voucher_live(p_draft_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.sa_post_journal_voucher(p_draft_id, false);
$$;

COMMENT ON FUNCTION public.sa_post_journal_voucher_live(uuid) IS
$c$Phase 3 wrapper: explicit live-posting entry point. Calls the underlying RPC with
p_dry_run=false. Use this from edge functions / UI when you intend a real ledger write.$c$;

GRANT EXECUTE ON FUNCTION public.sa_post_journal_voucher_live(uuid) TO authenticated;
