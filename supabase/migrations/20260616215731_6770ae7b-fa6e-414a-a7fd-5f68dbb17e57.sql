
-- ============================================================
-- seed_company_coa: زرع شجرة حسابات معيارية لفرع جديد
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_company_coa(
  p_owner_id uuid,
  p_profile  text DEFAULT 'standard'  -- 'standard' | 'services'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller uuid := auth.uid();
  v_existing int;
  v_inserted int := 0;
  v_is_services boolean := (p_profile = 'services');
BEGIN
  -- صلاحية: super_admin فقط (الدالة تكتب في دفاتر مستأجر آخر)
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: super_admin required';
  END IF;

  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'p_owner_id is required';
  END IF;

  -- Idempotent: إن وُجدت حسابات أصلاً، اخرج بأمان
  SELECT count(*) INTO v_existing FROM public.accounts WHERE user_id = p_owner_id;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_seeded', 'existing', v_existing);
  END IF;

  -- ===== 1xxx الأصول =====
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
    (p_owner_id, '1110', 'الصندوق',         'أصول', NULL,   'debit', 'cash', true),
    (p_owner_id, '1115', 'صندوق الشيكل',    'أصول', '1110', 'debit', NULL,   false),
    (p_owner_id, '1120', 'البنك',           'أصول', NULL,   'debit', 'bank', true),
    (p_owner_id, '1130', 'ذمم عملاء',       'أصول', NULL,   'debit', 'ar',   true),
    (p_owner_id, '1150', 'شيكات واردة',     'أصول', NULL,   'debit', NULL,   false),
    (p_owner_id, '1160', 'المصاريف المدفوعة مقدماً', 'أصول', NULL, 'debit', NULL, false),
    (p_owner_id, '1170', 'التأمينات المدفوعة', 'أصول', NULL, 'debit', NULL,   false),
    (p_owner_id, '1180', 'ضريبة القيمة المضافة - مدخلات', 'أصول', NULL, 'debit', NULL, false),
    (p_owner_id, '1210', 'مركبات',          'أصول', NULL,   'debit', NULL,   false),
    (p_owner_id, '1220', 'معدات وأجهزة',    'أصول', NULL,   'debit', NULL,   false),
    (p_owner_id, '1230', 'المباني',          'أصول', NULL,   'debit', NULL,   false),
    (p_owner_id, '1290', 'مجمع الاستهلاك',   'أصول', NULL,   'debit', NULL,   false);

  -- المخزون فقط في البروفايل التجاري
  IF NOT v_is_services THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
      (p_owner_id, '1140', 'المخزون', 'أصول', NULL, 'debit', 'inventory', true);
  END IF;

  -- ===== 2xxx الخصوم =====
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
    (p_owner_id, '2110', 'ذمم موردين',          'خصوم', NULL,   'credit', 'ap',                true),
    (p_owner_id, '2120', 'شيكات صادرة',         'خصوم', NULL,   'credit', NULL,                false),
    (p_owner_id, '2130', 'الرواتب المستحقة',    'خصوم', NULL,   'credit', 'salaries_payable',  true),
    (p_owner_id, '2140', 'الضرائب المستحقة',    'خصوم', NULL,   'credit', 'vat_payable',       true),
    (p_owner_id, '2150', 'الإيجار المستحق',     'خصوم', NULL,   'credit', NULL,                false),
    (p_owner_id, '2180', 'ذمم موظفين',          'خصوم', NULL,   'credit', NULL,                false),
    (p_owner_id, '2190', 'ضريبة القيمة المضافة - مبيعات', 'خصوم', NULL, 'credit', NULL,        false);

  -- ===== 3xxx حقوق الملكية =====
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
    (p_owner_id, '3100', 'رأس المال',         'حقوق ملكية', NULL,   'credit', NULL,                false),
    (p_owner_id, '3150', 'الاحتياطي النظامي', 'حقوق ملكية', '3100', 'credit', NULL,                false),
    (p_owner_id, '3200', 'أرباح محتجزة',      'حقوق ملكية', NULL,   'credit', 'retained_earnings', true),
    (p_owner_id, '3300', 'الأرباح والخسائر',  'حقوق ملكية', NULL,   'credit', 'retained_earnings', true),
    (p_owner_id, '3400', 'أرصدة افتتاحية',    'حقوق ملكية', NULL,   'credit', 'opening_balance',   true),
    (p_owner_id, '3500', 'المسحوبات الشخصية', 'حقوق ملكية', NULL,   'credit', NULL,                false);

  -- ===== 4xxx الإيرادات =====
  IF v_is_services THEN
    -- نسخة خدمات: 4200 يحمل دور sales_revenue ليلتقطه محرّك القيود
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
      (p_owner_id, '4200', 'إيرادات خدمات / دورات', 'إيرادات', NULL,   'credit', 'sales_revenue', true),
      (p_owner_id, '4300', 'إيرادات أخرى',           'إيرادات', NULL,   'credit', NULL,            false),
      (p_owner_id, '4310', 'إيرادات متنوعة',          'إيرادات', '4300', 'credit', NULL,            false);
  ELSE
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
      (p_owner_id, '4100', 'إيرادات مبيعات',         'إيرادات', NULL,   'credit', 'sales_revenue', true),
      (p_owner_id, '4150', 'مردودات المبيعات',       'إيرادات', '4100', 'credit', NULL,            true),
      (p_owner_id, '4200', 'إيرادات خدمات',          'إيرادات', NULL,   'credit', NULL,            false),
      (p_owner_id, '4300', 'إيرادات أخرى',           'إيرادات', NULL,   'credit', NULL,            false),
      (p_owner_id, '4310', 'إيرادات متنوعة',          'إيرادات', '4300', 'credit', NULL,            false),
      (p_owner_id, '4500', 'خصم المبيعات المسموح به','إيرادات', NULL,   'debit',  NULL,            false);
  END IF;

  -- ===== 5xxx التكاليف والمصاريف =====
  -- تكلفة البضاعة والمشتريات فقط في التجاري
  IF NOT v_is_services THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
      (p_owner_id, '5100', 'تكلفة البضاعة المباعة', 'مشتريات', NULL,   'debit', 'cogs', true),
      (p_owner_id, '5110', 'المشتريات',             'مشتريات', '5100', 'debit', 'cogs', true),
      (p_owner_id, '5160', 'مردودات المشتريات',     'مصروفات', '5110', 'debit', NULL,   true);
  END IF;

  -- مصاريف تشغيلية (للجميع)
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
    (p_owner_id, '5300', 'مصاريف تشغيلية',          'مصاريف', NULL,   'debit', NULL, false),
    (p_owner_id, '5310', 'رواتب وأجور',              'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5311', 'مكافآت وحوافز',            'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5312', 'تأمين صحي',                'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5320', 'إيجار المكتب/المحل',       'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5330', 'كهرباء وماء',              'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5340', 'اتصالات وإنترنت',          'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5350', 'مصاريف نقل وتوصيل',        'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5360', 'صيانة ونظافة',             'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5370', 'قرطاسية ومستلزمات مكتبية', 'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5380', 'ضيافة وتمثيل',             'مصاريف', '5300', 'debit', NULL, false),
    (p_owner_id, '5500', 'مصاريف عمومية وإدارية',    'مصاريف', NULL,   'debit', NULL, false),
    (p_owner_id, '5600', 'مصاريف تسويق ودعاية',      'مصاريف', NULL,   'debit', NULL, false),
    (p_owner_id, '5610', 'مصروف الاستهلاك',           'مصاريف', NULL,   'debit', NULL, false),
    (p_owner_id, '5900', 'مصاريف أخرى',              'مصاريف', NULL,   'debit', NULL, false),
    (p_owner_id, '6100', 'فوائد بنكية',              'مصاريف', NULL,   'debit', NULL, false);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT count(*) INTO v_inserted FROM public.accounts WHERE user_id = p_owner_id;

  RETURN jsonb_build_object('skipped', false, 'profile', p_profile, 'inserted', v_inserted);
END;
$func$;

REVOKE ALL ON FUNCTION public.seed_company_coa(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_company_coa(uuid, text) TO authenticated, service_role;

-- ============================================================
-- seed_sector_accounts: إضافات قطاعية على شجرة موجودة
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_sector_accounts(
  p_owner_id uuid,
  p_sector   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller uuid := auth.uid();
  v_added  int := 0;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: super_admin required';
  END IF;

  IF p_sector = 'medical_dental' THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
      (p_owner_id, '1141', 'مخزون زرعات الأسنان',        'أصول',    '1140', 'debit',  NULL, false),
      (p_owner_id, '1142', 'مخزون المستلزمات السنّية',   'أصول',    '1140', 'debit',  NULL, false),
      (p_owner_id, '4210', 'إيرادات تركيب وخدمة',         'إيرادات', '4200', 'credit', NULL, false)
    ON CONFLICT (user_id, account_code) DO NOTHING;

  ELSIF p_sector = 'medical_tender' THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, system_role, is_system_protected) VALUES
      (p_owner_id, '1171', 'تأمين عطاءات',                'أصول', '1170', 'debit',  NULL, false),
      (p_owner_id, '2171', 'كفالات بنكية ابتدائية',       'خصوم', NULL,   'credit', NULL, false),
      (p_owner_id, '2172', 'كفالات بنكية لحسن التنفيذ',   'خصوم', NULL,   'credit', NULL, false)
    ON CONFLICT (user_id, account_code) DO NOTHING;

  ELSIF p_sector = 'education' THEN
    -- لا إضافات قطاعية حالياً
    NULL;
  END IF;

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('sector', p_sector, 'added', v_added);
END;
$func$;

REVOKE ALL ON FUNCTION public.seed_sector_accounts(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_sector_accounts(uuid, text) TO authenticated, service_role;

-- ============================================================
-- تنفيذ الزرع على فروع سبارتا الثلاثة
-- ============================================================
DO $exec$
DECLARE
  v_dental uuid := 'c17c8f10-098f-454d-a353-79141524ddc5';
  v_japan  uuid := '42977669-2143-4924-a527-0016a7bc59bb';
  v_edu    uuid := '5c1a8560-91ec-4687-99df-933c845f41a6';
BEGIN
  PERFORM public.seed_company_coa(v_dental, 'standard');
  PERFORM public.seed_sector_accounts(v_dental, 'medical_dental');

  PERFORM public.seed_company_coa(v_japan, 'standard');
  PERFORM public.seed_sector_accounts(v_japan, 'medical_tender');

  PERFORM public.seed_company_coa(v_edu, 'services');
  PERFORM public.seed_sector_accounts(v_edu, 'education');
END;
$exec$;
