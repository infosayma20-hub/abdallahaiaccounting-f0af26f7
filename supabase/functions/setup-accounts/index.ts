import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

interface SetupRequest {
  userId: string;
  businessType: string;
  hasInventory: boolean;
  hasReceivables: boolean;
  hasEmployees: boolean;
}

// شجرة الحسابات الافتراضية الكاملة من Airtable
const DEFAULT_ACCOUNTS: { code: string; name: string; type: string; parent: string | null; is_contra?: boolean; nature?: string; desc?: string }[] = [
  // ═══════════ الأصول المتداولة (11xx) ═══════════
  { code: "1110", name: "الصندوق", type: "أصول", parent: null, desc: "النقدية وما في حكمها (في الخزينة والعهود)" },
  { code: "1111", name: "صندوق الدولار", type: "أصول", parent: "1110" },
  { code: "1112", name: "صندوق الدينار", type: "أصول", parent: "1110" },
  { code: "1113", name: "صندوق اليورو", type: "أصول", parent: "1110" },
  { code: "1114", name: "صندوق الجنيه المصري", type: "أصول", parent: "1110" },
  { code: "1120", name: "البنك", type: "أصول", parent: null, desc: "النقدية في البنوك — حسابات جارية وتوفير" },
  { code: "1121", name: "بنك 1", type: "أصول", parent: "1120", desc: "حساب البنك الجاري الرئيسي" },
  { code: "1122", name: "بنك 2 - حساب التوفير", type: "أصول", parent: "1120", desc: "حساب التوفير البنكي" },
  { code: "1123", name: "بنك 3 - حساب جاري شيكل", type: "أصول", parent: "1120", desc: "حساب جاري بالشيكل الإسرائيلي" },
  { code: "1124", name: "بنك 4 - حساب جاري دولار", type: "أصول", parent: "1120", desc: "حساب جاري بالدولار الأمريكي" },
  { code: "1125", name: "بنك 5 - حساب جاري دينار", type: "أصول", parent: "1120", desc: "حساب جاري بالدينار الأردني" },
  { code: "1130", name: "ذمم عملاء", type: "أصول", parent: null, desc: "مبالغ مستحقة على حسابات العملاء (بالآجل)" },
  { code: "1140", name: "المخزون", type: "أصول", parent: null, desc: "المخزون ويشمل المواد الأولية وتامة الصنع" },
  { code: "1150", name: "شيكات واردة", type: "أصول", parent: null, desc: "شيكات مستلمة من العملاء لم تُحصَّل بعد" },
  { code: "1160", name: "المصاريف المدفوعة مقدماً", type: "أصول", parent: null, desc: "مصروف مدفوع مقدماً يتم إطفاؤه خلال السنة المالية" },
  { code: "1170", name: "التأمينات المدفوعة", type: "أصول", parent: null, desc: "تأمينات مدفوعة مقدماً لصالح المنشأة" },
  { code: "1180", name: "ضريبة القيمة المضافة - مدخلات", type: "أصول", parent: null, desc: "ضريبة القيمة المضافة المدفوعة على فواتير المشتريات — قابلة للخصم من ضريبة المخرجات وفق القانون الفلسطيني رقم 26 لسنة 2024" },
  { code: "2180", name: "ذمم موظفين", type: "التزامات", parent: null, desc: "مبالغ مستحقة على الموظفين (سلف وعهد)" },

  // ═══════════ الأصول غير المتداولة (12xx) ═══════════
  { code: "1210", name: "مركبات", type: "أصول", parent: null, desc: "مركبات ووسائل نقل مملوكة للمنشأة" },
  { code: "1220", name: "معدات وأجهزة", type: "أصول", parent: null, desc: "معدات وأجهزة مكتبية وتشغيلية" },
  { code: "1230", name: "المباني", type: "أصول", parent: null, desc: "مباني ومنشآت مملوكة للشركة" },
  { code: "1250", name: "الأراضي", type: "أصول", parent: null, desc: "أراضي مملوكة للمنشأة لأغراض تشغيلية أو استثمارية" },
  { code: "1290", name: "مجمع الاستهلاك", type: "أصول", parent: null, desc: "مجمع استهلاك الأصول الثابتة (حساب مقابل — دائن بطبيعته)" },

  // ═══════════ الالتزامات المتداولة (21xx) ═══════════
  { code: "2110", name: "ذمم موردين", type: "خصوم", parent: null, desc: "مبالغ مستحقة لحسابات الموردين (بالآجل)" },
  { code: "2120", name: "شيكات صادرة", type: "خصوم", parent: null, desc: "شيكات صادرة لصالح موردين أو جهات دائنة" },
  { code: "2130", name: "الرواتب المستحقة", type: "خصوم", parent: null, desc: "رواتب مستحقة على المنشأة لم يتم سدادها بعد" },
  { code: "2140", name: "الضرائب المستحقة", type: "خصوم", parent: null, desc: "ضريبة الدخل والقيمة المضافة المستحقة الدفع" },
  { code: "2150", name: "الإيجار المستحق", type: "خصوم", parent: null, desc: "إيجار مستحق على المنشأة لم يُسدَّد بعد" },
  { code: "2160", name: "الكهرباء والماء المستحق", type: "خصوم", parent: null, desc: "فواتير كهرباء وماء مستحقة غير مسددة" },
  { code: "2170", name: "القروض قصيرة الأجل", type: "خصوم", parent: null, desc: "قروض قصيرة الأجل متوقع سدادها خلال سنة" },
  { code: "2190", name: "ضريبة القيمة المضافة - مبيعات", type: "خصوم", parent: null, desc: "ضريبة القيمة المضافة المحصّلة على فواتير المبيعات — مستحقة الدفع لوزارة المالية وفق القانون الفلسطيني رقم 26 لسنة 2024" },

  // ═══════════ الالتزامات غير المتداولة (22xx) ═══════════
  { code: "2210", name: "قروض بنكية", type: "خصوم", parent: null, desc: "قروض بنكية طويلة الأجل مستحقة السداد بعد سنة" },
  { code: "2220", name: "القروض طويلة الأجل", type: "خصوم", parent: null, desc: "قروض طويلة الأجل من جهات تمويلية أو شركاء" },

  // ═══════════ حقوق الملكية (3xxx) ═══════════
  { code: "3100", name: "رأس المال", type: "حقوق ملكية", parent: null, desc: "رأس المال المسجل أو المستثمر من قبل الملاك" },
  { code: "3200", name: "أرباح محتجزة", type: "حقوق ملكية", parent: null, desc: "الأرباح المتراكمة غير الموزعة من السنوات السابقة" },
  { code: "3300", name: "الأرباح والخسائر", type: "حقوق ملكية", parent: null, desc: "صافي ربح أو خسارة الفترة المالية الحالية" },
  { code: "3400", name: "أرصدة افتتاحية", type: "حقوق ملكية", parent: null, desc: "الأرصدة الافتتاحية عند بداية تشغيل النظام" },
  { code: "3500", name: "المسحوبات الشخصية", type: "حقوق ملكية", parent: null, desc: "المسحوبات الشخصية لصاحب المنشأة من الأرباح" },

  // ═══════════ الإيرادات (4xxx) ═══════════
  { code: "4100", name: "إيرادات مبيعات", type: "إيرادات", parent: null, is_contra: false, nature: "credit", desc: "الإيرادات الناتجة من بيع البضائع والمنتجات" },
  { code: "4200", name: "إيرادات خدمات", type: "إيرادات", parent: null, is_contra: false, nature: "credit", desc: "الإيرادات الناتجة من تقديم الخدمات للعملاء" },
  { code: "4300", name: "إيرادات أخرى", type: "إيرادات", parent: null, is_contra: false, nature: "credit", desc: "إيرادات من أنشطة أخرى غير النشاط الأساسي" },
  { code: "4310", name: "إيرادات متنوعة", type: "إيرادات", parent: "4300", is_contra: false, nature: "credit", desc: "إيرادات متنوعة غير مصنفة" },
  { code: "4320", name: "إيرادات الإيجار", type: "إيرادات", parent: "4300", is_contra: false, nature: "credit", desc: "إيرادات من تأجير الأصول أو العقارات" },
  { code: "4330", name: "إيرادات الفوائد", type: "إيرادات", parent: "4300", is_contra: false, nature: "credit", desc: "فوائد بنكية وعوائد على الاستثمارات المالية" },
  { code: "4340", name: "أرباح بيع الأصول", type: "إيرادات", parent: "4300", is_contra: false, nature: "credit", desc: "أرباح من بيع الأصول الثابتة بأكثر من قيمتها الدفترية" },
  { code: "4360", name: "إيرادات رواتب وأجور", type: "إيرادات", parent: "4300", is_contra: false, nature: "credit", desc: "إيرادات رواتب وأجور مستردة أو محمّلة على جهات أخرى" },
  // ── حسابات مقابلة للإيرادات (Contra Revenue) ──
  { code: "4400", name: "مردودات ومسموحات مبيعات", type: "إيرادات", parent: null, is_contra: true, nature: "debit", desc: "مردودات من مبيعات — تخفض إيرادات المبيعات" },
  { code: "4500", name: "خصم المبيعات المسموح به", type: "إيرادات", parent: null, is_contra: true, nature: "debit", desc: "خصومات ممنوحة للعملاء — تخفض صافي المبيعات" },

  // ═══════════ تكلفة المبيعات والمشتريات (51xx) ═══════════
  { code: "5100", name: "تكلفة البضاعة المباعة", type: "مشتريات", parent: null, desc: "تكلفة البضاعة المباعة — الحساب الرئيسي" },
  { code: "5110", name: "المشتريات", type: "مشتريات", parent: "5100", desc: "المشتريات الفعلية من الموردين" },

  // ═══════════ تكاليف الاستيراد (52xx) ═══════════
  { code: "5200", name: "تكاليف الاستيراد", type: "مشتريات", parent: null, desc: "إجمالي تكاليف الاستيراد — جمارك وشحن وتخليص" },
  { code: "5210", name: "رسوم جمركية", type: "مشتريات", parent: "5200", desc: "رسوم جمركية مدفوعة على البضائع المستوردة" },
  { code: "5220", name: "شحن دولي", type: "مشتريات", parent: "5200", desc: "تكاليف الشحن الدولي (بحري، جوي، بري)" },
  { code: "5230", name: "تخليص جمركي", type: "مشتريات", parent: "5200", desc: "أتعاب وتكاليف التخليص الجمركي" },
  { code: "5240", name: "تأمين شحن", type: "مشتريات", parent: "5200", desc: "تكاليف تأمين البضائع أثناء الشحن" },
  { code: "5250", name: "نقل داخلي من الميناء", type: "مشتريات", parent: "5200", desc: "تكاليف النقل الداخلي من الميناء إلى المستودع" },
  { code: "5260", name: "رسوم ميناء وتخزين", type: "مشتريات", parent: "5200", desc: "رسوم الميناء والأرضيات والتخزين المؤقت" },
  { code: "5270", name: "عمولات استيراد", type: "مشتريات", parent: "5200", desc: "عمولات الوكلاء والوسطاء التجاريين" },
  { code: "5280", name: "ضريبة استيراد", type: "مشتريات", parent: "5200", desc: "ضرائب إضافية مفروضة على الاستيراد" },
  { code: "5290", name: "تكاليف استيراد أخرى", type: "مشتريات", parent: "5200", desc: "تكاليف أخرى مرتبطة بالاستيراد" },

  // ═══════════ المصاريف التشغيلية (53xx-58xx) ═══════════
  { code: "5300", name: "مصاريف إدارية وعمومية", type: "مصاريف", parent: null, desc: "مصاريف إدارية عامة — الحساب الرئيسي" },
  { code: "5310", name: "رواتب وأجور", type: "مصاريف", parent: "5300", desc: "رواتب الموظفين والعاملين في المنشأة" },
  { code: "5311", name: "مكافآت وحوافز", type: "مصاريف", parent: "5300", desc: "مكافآت وحوافز الأداء للموظفين" },
  { code: "5312", name: "تأمين صحي", type: "مصاريف", parent: "5300", desc: "تأمين صحي للموظفين" },
  { code: "5313", name: "تأمين اجتماعي ومعاشات", type: "مصاريف", parent: "5300", desc: "مساهمات التقاعد والضمان الاجتماعي" },
  { code: "5314", name: "بدل مواصلات", type: "مصاريف", parent: "5300", desc: "بدل مواصلات للموظفين" },
  { code: "5315", name: "بدل هاتف", type: "مصاريف", parent: "5300", desc: "بدل هاتف جوال للموظفين" },
  { code: "5320", name: "إيجار المكتب/المحل", type: "مصاريف", parent: "5300", desc: "إيجار المحل أو المكتب أو المخزن" },
  { code: "5330", name: "كهرباء وماء", type: "مصاريف", parent: "5300", desc: "فواتير كهرباء وماء المنشأة" },
  { code: "5340", name: "اتصالات وإنترنت", type: "مصاريف", parent: "5300", desc: "مصاريف الاتصالات الهاتفية والإنترنت" },
  { code: "5350", name: "مصاريف نقل وتوصيل", type: "مصاريف", parent: "5300", desc: "مصاريف نقل وتوصيل البضائع والطلبيات" },
  { code: "5360", name: "صيانة ونظافة", type: "مصاريف", parent: "5300", desc: "مصاريف صيانة المعدات ونظافة المنشأة" },
  { code: "5370", name: "قرطاسية ومستلزمات مكتبية", type: "مصاريف", parent: "5300", desc: "قرطاسية ومستلزمات مكتبية استهلاكية" },
  { code: "5380", name: "ضيافة وتمثيل", type: "مصاريف", parent: "5300", desc: "مصاريف ضيافة وعلاقات عامة" },
  { code: "5390", name: "تأمينات عامة", type: "مصاريف", parent: "5300", desc: "مصاريف تأمينات عامة (ممتلكات، حريق)" },
  { code: "5400", name: "مصاريف مركبات ووقود", type: "مصاريف", parent: null, desc: "مصاريف مركبات ووقود — الحساب الرئيسي" },
  { code: "5410", name: "وقود", type: "مصاريف", parent: "5400", desc: "مصاريف وقود ومحروقات للمركبات" },
  { code: "5420", name: "صيانة مركبات", type: "مصاريف", parent: "5400", desc: "مصاريف صيانة وإصلاح المركبات" },
  { code: "5430", name: "ترخيص وتأمين مركبات", type: "مصاريف", parent: "5400", desc: "مصاريف ترخيص وتأمين المركبات" },
  { code: "5500", name: "مصاريف تسويق وإعلان", type: "مصاريف", parent: null, desc: "مصاريف الإعلان والتسويق الرقمي والتقليدي" },
  { code: "5510", name: "إعلانات رقمية", type: "مصاريف", parent: "5500", desc: "إعلانات رقمية عبر وسائل التواصل الاجتماعي" },
  { code: "5520", name: "مطبوعات ولافتات", type: "مصاريف", parent: "5500", desc: "مطبوعات ولافتات ومواد دعائية" },
  { code: "5530", name: "رعايات وفعاليات", type: "مصاريف", parent: "5500", desc: "مصاريف رعايات وفعاليات تسويقية" },
  { code: "5600", name: "إهلاك واستهلاك", type: "مصاريف", parent: null, desc: "مصاريف إهلاك الأصول الثابتة — الحساب الرئيسي" },
  { code: "5610", name: "إهلاك مركبات", type: "مصاريف", parent: "5600", desc: "إهلاك مركبات المنشأة" },
  { code: "5620", name: "إهلاك معدات", type: "مصاريف", parent: "5600", desc: "إهلاك معدات وأجهزة المنشأة" },
  { code: "5630", name: "إهلاك مباني", type: "مصاريف", parent: "5600", desc: "إهلاك المباني والمنشآت" },
  { code: "5700", name: "مصاريف قانونية واستشارية", type: "مصاريف", parent: null, desc: "مصاريف قانونية — الحساب الرئيسي" },
  { code: "5710", name: "أتعاب محاماة", type: "مصاريف", parent: "5700", desc: "أتعاب المحاماة والاستشارات القانونية" },
  { code: "5720", name: "محاسبة وتدقيق", type: "مصاريف", parent: "5700", desc: "أتعاب مدقق الحسابات والمحاسب القانوني" },
  { code: "5730", name: "استشارات فنية", type: "مصاريف", parent: "5700", desc: "استشارات فنية وتقنية متخصصة" },
  { code: "5800", name: "تكنولوجيا وبرمجيات", type: "مصاريف", parent: null, desc: "مصاريف تكنولوجيا — الحساب الرئيسي" },
  { code: "5810", name: "اشتراكات برمجيات", type: "مصاريف", parent: "5800", desc: "اشتراكات في برامج وأنظمة حاسوبية" },
  { code: "5820", name: "صيانة أنظمة", type: "مصاريف", parent: "5800", desc: "مصاريف صيانة الأنظمة والبنية التحتية التقنية" },

  // ═══════════ مصاريف متنوعة (59xx) ═══════════
  { code: "5900", name: "مصاريف متنوعة", type: "مصاريف", parent: null, desc: "مصاريف متنوعة غير مصنفة — الحساب الرئيسي" },
  { code: "5910", name: "مصاريف بنكية", type: "مصاريف", parent: "5900", desc: "عمولات ورسوم بنكية على المعاملات" },
  { code: "5920", name: "خسائر صرف عملات", type: "مصاريف", parent: "5900", desc: "خسائر ناتجة عن تغيّر أسعار صرف العملات" },
  { code: "5930", name: "تبرعات وهبات", type: "مصاريف", parent: "5900", desc: "تبرعات وهبات وإعانات مقدمة من المنشأة" },
  { code: "5940", name: "رسوم حكومية", type: "مصاريف", parent: "5900", desc: "رسوم حكومية ورخص وتصاريح مختلفة" },
  { code: "5950", name: "غرامات وجزاءات", type: "مصاريف", parent: "5900", desc: "غرامات ومخالفات وجزاءات رسمية" },
  { code: "5960", name: "ديون معدومة", type: "مصاريف", parent: "5900", desc: "ديون معدومة لا يمكن تحصيلها من العملاء" },

  // ═══════════ مصاريف مالية (6xxx) ═══════════
  { code: "6100", name: "مصاريف فوائد بنكية", type: "مصاريف", parent: null, desc: "مصاريف فوائد بنكية على القروض" },
  { code: "6110", name: "عمولات بنكية", type: "مصاريف", parent: "6100", desc: "عمولات بنكية على المعاملات والحوالات" },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const authenticatedUserId = authResult.userId;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: SetupRequest = await req.json();
    const { userId } = body;

    if (userId !== authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // TENANT-OWNER GUARD (defense in depth, strict)
    // The company-registration wizard is for brand-new tenant owners ONLY.
    // A "tenant owner" is a user that has NO existing connection to any
    // other tenant. The wizard creates a brand-new chart-of-accounts under
    // the caller's own auth UID; if that caller is already an employee /
    // cashier / call-center / HR / accountant / sales rep / portal /
    // worker / store-tracker / feedback agent of ANOTHER company, the
    // resulting data is permanently orphaned. So we refuse.
    //
    // The only callers allowed through are:
    //   (1) super_admin (Lovable team), OR
    //   (2) a user with NO employees row, NO pos_users row, NO non-owner
    //       role, and NO granted feature permissions. (`admin` role or
    //       no role at all is fine — fresh tenant owner.)
    // ──────────────────────────────────────────────────────────────────
    const [
      { data: rolesRows },
      { data: empRow },
      { data: posUserRow },
      { data: featurePermRows },
    ] = await Promise.all([
      supabaseAdmin.from('user_roles').select('role').eq('user_id', userId),
      supabaseAdmin
        .from('employees')
        .select('id, user_id, is_active, is_terminated')
        .eq('auth_user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('pos_users')
        .select('id, user_id, is_active, is_call_center')
        .eq('auth_user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('user_feature_permissions')
        .select('id')
        .eq('target_user_id', userId)
        .eq('access_state', 'allow')
        .limit(1),
    ]);

    const roles: string[] = (rolesRows || []).map((r: any) => r.role);

    // super_admin always allowed
    const isSuperAdmin = roles.includes('super_admin');

    // ANY role other than admin / super_admin = non-owner role.
    // This covers hr_manager, accountant_senior/sales/purchases, cashier,
    // sales_rep, employee, portal, worker, store_tracker, and anything
    // future. Tenant owners only ever hold `admin` (or no role).
    const NON_OWNER_ROLES = new Set([
      'hr_manager',
      'accountant_senior', 'accountant_sales', 'accountant_purchases',
      'cashier', 'sales_rep', 'employee', 'portal', 'worker', 'store_tracker',
      'branch_scheduler', 'call_center',
    ]);
    const hasNonOwnerRole = roles.some((r) => NON_OWNER_ROLES.has(r));

    // Linked as an active employee of a DIFFERENT tenant
    const isLinkedEmployee =
      !!empRow && empRow.is_active && !empRow.is_terminated && empRow.user_id !== userId;

    // Cashier / Call-Center / Waiter — any pos_users row tied to another tenant
    const isLinkedPosUser =
      !!posUserRow && posUserRow.is_active !== false && posUserRow.user_id !== userId;

    // Feedback / portal grants from another tenant
    const hasGrantedFeaturePerm = !!featurePermRows && featurePermRows.length > 0;

    const isTenantBound =
      isLinkedEmployee || isLinkedPosUser || hasNonOwnerRole || hasGrantedFeaturePerm;

    if (isTenantBound && !isSuperAdmin) {
      console.warn('[setup-accounts] blocked tenant-bound caller', {
        userId,
        roles,
        isLinkedEmployee,
        isLinkedPosUser,
        hasNonOwnerRole,
        hasGrantedFeaturePerm,
        tenantOwner: empRow?.user_id ?? posUserRow?.user_id,
      });
      return new Response(
        JSON.stringify({
          error: 'هذا الحساب تابع لشركة مسجلة مسبقاً ولا يمكنه إنشاء شركة جديدة',
          code: 'NOT_TENANT_OWNER',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Upsert all default accounts (skip duplicates gracefully)
    const accountsToInsert = DEFAULT_ACCOUNTS.map(a => ({
      user_id: userId,
      account_code: a.code,
      account_name: a.name,
      account_type: a.type,
      parent_code: a.parent,
      is_system: true,
      is_active: true,
      is_contra: a.is_contra || false,
      nature: a.nature || (
        ['أصول', 'مصاريف', 'مشتريات'].includes(a.type) ? 'debit' : 'credit'
      ),
      description_ar: a.desc || null,
    }));

    const errors: string[] = [];
    let inserted = 0;
    for (let i = 0; i < accountsToInsert.length; i += 50) {
      const batch = accountsToInsert.slice(i, i + 50);
      const { data, error } = await supabaseAdmin
        .from('accounts')
        .upsert(batch, { onConflict: 'user_id,account_code', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error(`Batch error at ${i}:`, error);
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        inserted += (data?.length || 0);
      }
    }

    // Verify accounts were actually created by counting with service role
    const { count: totalCount } = await supabaseAdmin
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (!totalCount || totalCount === 0) {
      console.error('No accounts found after setup. Errors:', errors);
      return new Response(JSON.stringify({
        error: 'فشل في إنشاء شجرة الحسابات',
        details: errors,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `تم إنشاء ${inserted} حساب بنجاح`,
      created: inserted,
      total: totalCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Setup accounts error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
