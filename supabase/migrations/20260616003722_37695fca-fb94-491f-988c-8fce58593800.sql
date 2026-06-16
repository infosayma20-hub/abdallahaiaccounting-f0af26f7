
-- ============================================================
-- Smart Accountant — Phase 1 v3 (Global Taxonomy + strict-leaf resolver)
-- Replaces prior per-tenant scaffold. Zero ledger writes.
-- ============================================================

-- 1) Drop prior per-tenant artefacts
DROP FUNCTION IF EXISTS public.sa_resolve_account(uuid, text, text, text);
DROP TABLE   IF EXISTS public.smart_accountant_categories CASCADE;

-- 2) Global taxonomy table (shared across tenants)
CREATE TABLE public.smart_accountant_categories (
  code                        text PRIMARY KEY,
  name_ar                     text NOT NULL,
  name_en                     text,
  debit_role                  text,
  credit_role                 text,
  debit_code_fallback         text,
  credit_code_fallback        text,
  posting_target              text NOT NULL CHECK (posting_target IN
    ('sales_invoice','purchase_bill','workshop_cost',
     'payment_voucher','journal_voucher','stock_issue')),
  affects_stock               boolean NOT NULL DEFAULT false,
  ambiguity_resolution_policy text NOT NULL DEFAULT 'auto_remember'
    CHECK (ambiguity_resolution_policy IN ('auto_remember','explicit_confirm')),
  default_currency            text NOT NULL DEFAULT 'ILS',
  keywords                    text[] NOT NULL DEFAULT '{}',
  is_active                   boolean NOT NULL DEFAULT true,
  sort_order                  int DEFAULT 100,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.smart_accountant_categories TO authenticated;
GRANT ALL    ON public.smart_accountant_categories TO service_role;
-- public taxonomy: anon can read too (no PII; needed for marketing/preview).
GRANT SELECT ON public.smart_accountant_categories TO anon;

ALTER TABLE public.smart_accountant_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY sac_read_all
  ON public.smart_accountant_categories
  FOR SELECT
  USING (true);
-- No INSERT/UPDATE/DELETE policies → only service_role can mutate.

CREATE TRIGGER trg_sac_updated_at
  BEFORE UPDATE ON public.smart_accountant_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Seed 14 active categories
INSERT INTO public.smart_accountant_categories
  (code, name_ar, name_en, debit_role, credit_role, debit_code_fallback, credit_code_fallback,
   posting_target, affects_stock, ambiguity_resolution_policy, keywords, sort_order)
VALUES
  ('SALE',         'بيع',            'Sale',                 'cash',                    'sales_revenue', '1110','4100','sales_invoice',   true,  'explicit_confirm',
     ARRAY['بيع','بعت','مبيعات','طلبية','زبون اشترى','بعنا','مبيع'], 10),
  ('CAPITAL',      'رأس المال',      'Capital',              'cash',                    'capital',       '1110','3100','journal_voucher', false, 'explicit_confirm',
     ARRAY['راس المال','رأس المال','رصيد افتتاحي','ضخ مال','رأسمال'], 20),
  ('DRAWINGS',     'مصروف شخصي',     'Owner Drawings',       'owner_drawings',          'cash',          '3120','1110','payment_voucher', false, 'auto_remember',
     ARRAY['شخصي','مصروف شخصي','سحب شخصي','مسحوبات','لحالي'], 30),
  ('FABRIC',       'شراء قماش',      'Fabric Purchase',      'raw_materials_inventory', 'cash',          '1310','1110','purchase_bill',   true,  'auto_remember',
     ARRAY['قماش','شراء قماش','خام','أقمشة','قماشة'], 40),
  ('CUTTING',      'قص قماش',        'Cutting',              'wip',                     'cash',          '1320','1110','workshop_cost',   false, 'auto_remember',
     ARRAY['قص','قص قماش','تفصيل'], 50),
  ('SEWING',       'خياطة',          'Sewing',               'wip',                     'cash',          '1320','1110','workshop_cost',   false, 'auto_remember',
     ARRAY['خياطة','خياط','حياكة','تطريز'], 60),
  ('LABELS',       'ليبلات/طباعة',   'Labels & Printing',    'wip',                     'cash',          '1320','1110','workshop_cost',   false, 'auto_remember',
     ARRAY['ليبل','ليبلات','طباعة','استيكر','تاغ','باركود','تغليف'], 70),
  ('SHIPPING_IN',  'شحن وارد',       'Inbound Shipping',     'finished_goods',          'cash',          '1330','1110','purchase_bill',   false, 'auto_remember',
     ARRAY['شحن','شحنة واردة','فريت','شحن وارد'], 80),
  ('CUSTOMS',      'تخليص جمركي',    'Customs Clearance',    'finished_goods',          'cash',          '1330','1110','purchase_bill',   false, 'auto_remember',
     ARRAY['تخليص','جمرك','تخليص جمركي','جمارك'], 90),
  ('INVENTORY_IN', 'إدخال مخزون',    'Inventory In',         'inventory',               'ap',            '1140','2110','purchase_bill',   true,  'auto_remember',
     ARRAY['ادخال مخزون','بضاعة','منتجات للمخزون','استلمت بضاعة','جرد افتتاحي'], 100),
  ('DELIVERY',     'توصيل',          'Delivery',             'delivery_expense',        'cash',          '6000','1110','payment_voucher', false, 'auto_remember',
     ARRAY['توصيل','دليفري','مندوب','توصيلة','شحن للزبون'], 110),
  ('ADS',          'إعلانات',        'Advertising',          'marketing_expense',       'cash',          '6400','1110','payment_voucher', false, 'auto_remember',
     ARRAY['اعلان','اعلانات','إعلان','دعاية','تسويق','بوست ممول','انستقرام','تيك توك'], 120),
  ('FINANCE',      'تمويل/فوائد',    'Finance Charges',      'finance_expense',         'cash',          '6500','1110','payment_voucher', false, 'auto_remember',
     ARRAY['تمويل','فائدة','فوائد','قرض','تقسيط','عمولة بنك'], 130),
  ('OTHER',        'مصاريف أخرى',    'Misc Expenses',        'misc_expense',            'cash',          '6900','1110','payment_voucher', false, 'auto_remember',
     ARRAY['مصروف','مصاريف','نثرية','متفرقات','مصاريف تانية','أخرى'], 140);

-- 4) sa_resolve_account(p_role, p_fallback_code, p_data_owner_id) → jsonb
-- STRICT-LEAF: parent (any children) → ambiguous with ALL leaf descendants as candidates.
-- No single-child collapse. Adding a sibling to COA must not silently flip resolved↔ambiguous.
CREATE OR REPLACE FUNCTION public.sa_resolve_account(
  p_role           text,
  p_fallback_code  text,
  p_data_owner_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_acc record;
  v_kids int;
  v_source text;
  v_candidates jsonb;
BEGIN
  IF p_data_owner_id IS NULL THEN
    RETURN jsonb_build_object('status','missing','account_id',NULL,'account_code',NULL,
                              'account_name',NULL,'candidates','[]'::jsonb,'source','no_tenant');
  END IF;

  -- Priority 1: code-first (95% of tenants rely on account_code, not system_role)
  IF p_fallback_code IS NOT NULL AND length(trim(p_fallback_code)) > 0 THEN
    SELECT a.id, a.account_code, a.account_name
      INTO v_acc
      FROM public.accounts a
     WHERE a.user_id = p_data_owner_id
       AND a.account_code = p_fallback_code
       AND (auth.uid() IS NULL OR public.is_team_member(auth.uid(), a.user_id))
     LIMIT 1;
    v_source := 'code_fallback';
  END IF;

  -- Priority 2: last resort by system_role
  IF v_acc.id IS NULL AND p_role IS NOT NULL AND length(trim(p_role)) > 0 THEN
    SELECT a.id, a.account_code, a.account_name
      INTO v_acc
      FROM public.accounts a
     WHERE a.user_id = p_data_owner_id
       AND a.system_role::text = p_role
       AND (auth.uid() IS NULL OR public.is_team_member(auth.uid(), a.user_id))
     ORDER BY a.account_code
     LIMIT 1;
    v_source := 'system_role';
  END IF;

  -- Missing: neither code nor role resolved
  IF v_acc.id IS NULL THEN
    RETURN jsonb_build_object(
      'status','missing',
      'account_id',NULL,
      'account_code', p_fallback_code,
      'account_name',NULL,
      'candidates','[]'::jsonb,
      'source', COALESCE(v_source,'none')
    );
  END IF;

  -- Strict-leaf check (direct children only — sufficient because if any direct child exists
  -- the node is a parent, regardless of depth)
  SELECT count(*) INTO v_kids
    FROM public.accounts c
   WHERE c.user_id = p_data_owner_id
     AND c.parent_code = v_acc.account_code
     AND (auth.uid() IS NULL OR public.is_team_member(auth.uid(), c.user_id));

  IF v_kids = 0 THEN
    RETURN jsonb_build_object(
      'status','resolved',
      'account_id', v_acc.id,
      'account_code', v_acc.account_code,
      'account_name', v_acc.account_name,
      'candidates','[]'::jsonb,
      'source', v_source
    );
  END IF;

  -- Parent → ambiguous: return ALL leaf descendants (recursive)
  WITH RECURSIVE descendants AS (
    SELECT a.id, a.account_code, a.account_name
      FROM public.accounts a
     WHERE a.user_id = p_data_owner_id
       AND a.parent_code = v_acc.account_code
       AND (auth.uid() IS NULL OR public.is_team_member(auth.uid(), a.user_id))
    UNION ALL
    SELECT ch.id, ch.account_code, ch.account_name
      FROM public.accounts ch
      JOIN descendants d ON ch.parent_code = d.account_code
     WHERE ch.user_id = p_data_owner_id
       AND (auth.uid() IS NULL OR public.is_team_member(auth.uid(), ch.user_id))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'account_id',   d.id,
           'account_code', d.account_code,
           'account_name', d.account_name
         ) ORDER BY d.account_code), '[]'::jsonb)
    INTO v_candidates
    FROM descendants d
   WHERE NOT EXISTS (
     SELECT 1 FROM public.accounts cc
      WHERE cc.user_id = p_data_owner_id
        AND cc.parent_code = d.account_code
   );

  RETURN jsonb_build_object(
    'status','ambiguous',
    'account_id', NULL,
    'account_code', v_acc.account_code,
    'account_name', v_acc.account_name,
    'candidates', v_candidates,
    'source', v_source
  );
END;
$$;

COMMENT ON FUNCTION public.sa_resolve_account(text,text,uuid) IS
$c$Smart-Accountant strict-leaf resolver.
Lookup priority: fallback_code → system_role. SECURITY INVOKER (RLS on accounts applies).
STRICT-LEAF rule: a parent with ANY children (incl. exactly one) returns status=ambiguous
with candidates[] = all leaf descendants. NO single-child collapse — rationale: "single
child" is a transient state, not a structural one; adding a sibling via the COA module
would silently flip the resolver from resolved→ambiguous with no code/seed change, which
is non-deterministic across time and an audit nightmare. Concrete risk example:
account 3100 (Capital) whose only child is 3150 (Statutory Reserve) — a collapse would
silently misclassify owner capital as a reserve.$c$;

-- 5) sa_guess_category(text) — NLP fallback over keywords[]
CREATE OR REPLACE FUNCTION public.sa_guess_category(p_text text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.code
    FROM public.smart_accountant_categories c
   WHERE c.is_active = true
     AND p_text IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(c.keywords) kw
        WHERE p_text ILIKE '%' || kw || '%'
     )
   ORDER BY c.sort_order ASC, c.code
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.sa_resolve_account(text,text,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.sa_guess_category(text)            TO authenticated, anon;
