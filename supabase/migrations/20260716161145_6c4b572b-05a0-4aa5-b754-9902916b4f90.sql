
-- =====================================================================
-- Phase 1: Periodic Inventory System (IAS 2 / IAS 1)
-- =====================================================================

-- 1) company_settings: add periodic inventory flags
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS inventory_system text NOT NULL DEFAULT 'perpetual',
  ADD COLUMN IF NOT EXISTS periodic_inventory_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS periodic_disclosure_method text NOT NULL DEFAULT 'weighted_avg';

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_inventory_system_check;
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_inventory_system_check
  CHECK (inventory_system IN ('perpetual', 'periodic'));

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_periodic_disclosure_method_check;
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_periodic_disclosure_method_check
  CHECK (periodic_disclosure_method IN ('weighted_avg', 'fifo'));

-- 2) Normalise 5100 account_type across the fleet (some rows say مصاريف)
UPDATE public.accounts
SET account_type = 'مشتريات'
WHERE account_code = '5100'
  AND account_type NOT IN ('مشتريات','Purchases');

-- 3) Seed the four periodic-inventory accounts for every existing user
--    who already has a 1140 (inventory) account. Idempotent.
INSERT INTO public.accounts
  (user_id, account_code, account_name, account_type, parent_code,
   is_system, is_active, is_system_protected, system_role, is_contra,
   nature, sub_group_label, display_order, description_ar)
SELECT DISTINCT a.user_id, '1148', 'مخزون أول المدة', 'أصول', '1140',
       true, true, true, 'inventory_opening', false,
       'debit', 'المخزون', 148,
       'رصيد المخزون في بداية الفترة — يُستخدم لقيود التسوية الدورية (IAS 2)'
FROM public.accounts a
WHERE a.account_code = '1140'
  AND NOT EXISTS (SELECT 1 FROM public.accounts b
                  WHERE b.user_id = a.user_id AND b.account_code = '1148');

INSERT INTO public.accounts
  (user_id, account_code, account_name, account_type, parent_code,
   is_system, is_active, is_system_protected, system_role, is_contra,
   nature, sub_group_label, display_order, description_ar)
SELECT DISTINCT a.user_id, '1149', 'مخزون آخر المدة', 'أصول', '1140',
       true, true, true, 'inventory_closing', false,
       'debit', 'المخزون', 149,
       'قيمة المخزون في نهاية الفترة بعد الجرد الفعلي (IAS 1 §54g)'
FROM public.accounts a
WHERE a.account_code = '1140'
  AND NOT EXISTS (SELECT 1 FROM public.accounts b
                  WHERE b.user_id = a.user_id AND b.account_code = '1149');

INSERT INTO public.accounts
  (user_id, account_code, account_name, account_type, parent_code,
   is_system, is_active, is_system_protected, system_role, is_contra,
   nature, sub_group_label, display_order, description_ar)
SELECT DISTINCT a.user_id, '5101', 'بضاعة أول المدة', 'مشتريات', '5100',
       true, true, true, 'cogs_opening', false,
       'debit', 'تكلفة المبيعات', 101,
       'يُحمّل بقيمة مخزون أول المدة عند إقفال الفترة (COGS component)'
FROM public.accounts a
WHERE a.account_code = '5100'
  AND NOT EXISTS (SELECT 1 FROM public.accounts b
                  WHERE b.user_id = a.user_id AND b.account_code = '5101');

INSERT INTO public.accounts
  (user_id, account_code, account_name, account_type, parent_code,
   is_system, is_active, is_system_protected, system_role, is_contra,
   nature, sub_group_label, display_order, description_ar)
SELECT DISTINCT a.user_id, '5102', 'بضاعة آخر المدة', 'مشتريات', '5100',
       true, true, true, 'cogs_closing', true,
       'credit', 'تكلفة المبيعات', 102,
       'حساب دائن مقابل (contra-COGS) يخفّض تكلفة المبيعات بقيمة مخزون آخر المدة'
FROM public.accounts a
WHERE a.account_code = '5100'
  AND NOT EXISTS (SELECT 1 FROM public.accounts b
                  WHERE b.user_id = a.user_id AND b.account_code = '5102');

-- 4) Seed function for future new companies
CREATE OR REPLACE FUNCTION public.seed_periodic_inventory_accounts(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts
    (user_id, account_code, account_name, account_type, parent_code,
     is_system, is_active, is_system_protected, system_role, is_contra,
     nature, sub_group_label, display_order, description_ar)
  VALUES
    (_user_id, '1148', 'مخزون أول المدة', 'أصول', '1140', true, true, true,
     'inventory_opening', false, 'debit', 'المخزون', 148,
     'رصيد المخزون في بداية الفترة'),
    (_user_id, '1149', 'مخزون آخر المدة', 'أصول', '1140', true, true, true,
     'inventory_closing', false, 'debit', 'المخزون', 149,
     'قيمة المخزون في نهاية الفترة بعد الجرد الفعلي'),
    (_user_id, '5101', 'بضاعة أول المدة', 'مشتريات', '5100', true, true, true,
     'cogs_opening', false, 'debit', 'تكلفة المبيعات', 101,
     'يُحمّل بقيمة مخزون أول المدة عند إقفال الفترة'),
    (_user_id, '5102', 'بضاعة آخر المدة', 'مشتريات', '5100', true, true, true,
     'cogs_closing', true, 'credit', 'تكلفة المبيعات', 102,
     'حساب دائن مقابل يخفّض تكلفة المبيعات')
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_periodic_inventory_accounts(uuid) TO authenticated, service_role;

-- 5) inventory_period_counts table
CREATE TABLE IF NOT EXISTS public.inventory_period_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_value numeric(18,2) NOT NULL DEFAULT 0,
  closing_value numeric(18,2) NOT NULL DEFAULT 0,
  costing_method text NOT NULL DEFAULT 'weighted_avg',
  notes text,
  status text NOT NULL DEFAULT 'draft', -- draft | posted | reversed
  opening_journal_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  closing_journal_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  posted_at timestamptz,
  posted_by uuid,
  reversed_at timestamptz,
  reversed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inv_period_counts_status_check CHECK (status IN ('draft','posted','reversed')),
  CONSTRAINT inv_period_counts_range_check  CHECK (period_end >= period_start),
  CONSTRAINT inv_period_counts_costing_check CHECK (costing_method IN ('weighted_avg','fifo'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_period_counts_active
  ON public.inventory_period_counts (user_id, period_start, period_end)
  WHERE status <> 'reversed';

CREATE INDEX IF NOT EXISTS idx_inventory_period_counts_user
  ON public.inventory_period_counts (user_id, period_end DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_period_counts TO authenticated;
GRANT ALL ON public.inventory_period_counts TO service_role;

ALTER TABLE public.inventory_period_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_period_counts_select_own"
  ON public.inventory_period_counts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "inv_period_counts_insert_own"
  ON public.inventory_period_counts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "inv_period_counts_update_own"
  ON public.inventory_period_counts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "inv_period_counts_delete_draft"
  ON public.inventory_period_counts FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'draft');

CREATE TRIGGER trg_inv_period_counts_updated
  BEFORE UPDATE ON public.inventory_period_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Guard trigger: block direct manual posting on periodic-inventory accounts
--    (only the RPC below is allowed; it sets a session GUC to bypass this)
CREATE OR REPLACE FUNCTION public.protect_periodic_inventory_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  guarded_codes text[] := ARRAY['1148','1149','5101','5102'];
  bypass text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Allow the trusted RPC to bypass this guard via a session-scoped GUC.
  BEGIN
    bypass := current_setting('app.allow_periodic_inventory_posting', true);
  EXCEPTION WHEN OTHERS THEN
    bypass := NULL;
  END;
  IF bypass = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.debit_account_code = ANY(guarded_codes)
     OR NEW.credit_account_code = ANY(guarded_codes) THEN
    RAISE EXCEPTION 'الحسابات (1148, 1149, 5101, 5102) محمية — لا يمكن الترحيل عليها يدوياً. استخدم شاشة جرد آخر المدة.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_periodic_inventory ON public.transactions;
CREATE TRIGGER trg_protect_periodic_inventory
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_periodic_inventory_accounts();

-- 7) RPC: post the two adjusting entries atomically
CREATE OR REPLACE FUNCTION public.post_periodic_inventory_adjustment(
  _count_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.inventory_period_counts%ROWTYPE;
  opening_tx_id uuid;
  closing_tx_id uuid;
  desc_prefix text;
BEGIN
  SELECT * INTO rec FROM public.inventory_period_counts
   WHERE id = _count_id AND user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل الجرد غير موجود أو لا تملك صلاحية' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF rec.status <> 'draft' THEN
    RAISE EXCEPTION 'قيد الجرد لهذه الفترة تم ترحيله مسبقاً (الحالة: %)', rec.status;
  END IF;

  desc_prefix := 'قيد تسوية جرد آخر المدة ' || to_char(rec.period_start,'YYYY-MM-DD') ||
                 ' → ' || to_char(rec.period_end,'YYYY-MM-DD');

  PERFORM set_config('app.allow_periodic_inventory_posting','on', true);

  -- Entry 1: transfer opening inventory to COGS
  --   Dr 5101 بضاعة أول المدة   / Cr 1148 مخزون أول المدة
  IF rec.opening_value > 0 THEN
    INSERT INTO public.transactions
      (user_id, transaction_date, description, debit_account_code, credit_account_code,
       amount, currency, transaction_type, reference, is_opening_balance)
    VALUES
      (rec.user_id, rec.period_end,
       desc_prefix || ' — عكس بضاعة أول المدة',
       '5101','1148', rec.opening_value, 'شيكل',
       'قيد تسوية مخزون', 'IPC-' || rec.id::text, false)
    RETURNING id INTO opening_tx_id;
  END IF;

  -- Entry 2: recognise closing inventory as asset, reduce COGS
  --   Dr 1149 مخزون آخر المدة  / Cr 5102 بضاعة آخر المدة
  IF rec.closing_value > 0 THEN
    INSERT INTO public.transactions
      (user_id, transaction_date, description, debit_account_code, credit_account_code,
       amount, currency, transaction_type, reference, is_opening_balance)
    VALUES
      (rec.user_id, rec.period_end,
       desc_prefix || ' — إثبات بضاعة آخر المدة',
       '1149','5102', rec.closing_value, 'شيكل',
       'قيد تسوية مخزون', 'IPC-' || rec.id::text, false)
    RETURNING id INTO closing_tx_id;
  END IF;

  UPDATE public.inventory_period_counts
     SET status = 'posted',
         opening_journal_id = opening_tx_id,
         closing_journal_id = closing_tx_id,
         posted_at = now(),
         posted_by = auth.uid()
   WHERE id = _count_id;

  RETURN jsonb_build_object(
    'ok', true,
    'opening_tx', opening_tx_id,
    'closing_tx', closing_tx_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_periodic_inventory_adjustment(uuid) TO authenticated;

-- 8) RPC: reverse a posted count (soft-delete the two entries)
CREATE OR REPLACE FUNCTION public.reverse_periodic_inventory_adjustment(_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.inventory_period_counts%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.inventory_period_counts
   WHERE id = _count_id AND user_id = auth.uid() FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل الجرد غير موجود';
  END IF;
  IF rec.status <> 'posted' THEN
    RAISE EXCEPTION 'لا يمكن عكس سجل غير مُرحّل';
  END IF;

  PERFORM set_config('app.allow_periodic_inventory_posting','on', true);

  IF rec.opening_journal_id IS NOT NULL THEN
    UPDATE public.transactions SET is_deleted = true, updated_at = now()
     WHERE id = rec.opening_journal_id AND user_id = auth.uid();
  END IF;
  IF rec.closing_journal_id IS NOT NULL THEN
    UPDATE public.transactions SET is_deleted = true, updated_at = now()
     WHERE id = rec.closing_journal_id AND user_id = auth.uid();
  END IF;

  UPDATE public.inventory_period_counts
     SET status='reversed', reversed_at = now(), reversed_by = auth.uid()
   WHERE id = _count_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_periodic_inventory_adjustment(uuid) TO authenticated;
