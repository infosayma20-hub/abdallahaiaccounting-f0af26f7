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
  { code: "2190", name: "ضريبة القيمة المضافة - مخرجات", type: "خصوم", parent: null, desc: "ضريبة القيمة المضافة المحصّلة على فواتير المبيعات — مستحقة الدفع لوزارة المالية وفق القانون الفلسطيني رقم 26 لسنة 2024" },

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
  { code: "5200", name: "تكاليف استيراد", type: "مشتريات", parent: "5100", desc: "تكاليف استيراد البضاعة من الخارج — الحساب الرئيسي" },
  { code: "5210", name: "تكاليف شحن", type: "مشتريات", parent: "5200", desc: "رسوم شحن البضاعة من المورد" },
  { code: "5220", name: "جمارك ورسوم", type: "مشتريات", parent: "5200", desc: "رسوم جمارك ومصاريف الاستيراد الرسمية" },
  { code: "5230", name: "تكاليف تخليص جمركي", type: "مشتريات", parent: "5200", desc: "أتعاب وكيل التخليص الجمركي" },
  { code: "5240", name: "رسوم مرفأ", type: "مشتريات", parent: "5200", desc: "رسوم المرفأ والميناء عند الاستيراد" },
  { code: "5250", name: "مكتب خارجي", type: "مشتريات", parent: "5200", desc: "رسوم مكتب الاستيراد الخارجي أو الوكيل" },
  { code: "5260", name: "نقل داخلي", type: "مشتريات", parent: "5200", desc: "تكاليف النقل الداخلي بعد التخليص" },
  { code: "5270", name: "تخزين", type: "مشتريات", parent: "5200", desc: "رسوم تخزين البضاعة في المستودع" },
  { code: "5280", name: "تأمين شحن", type: "مشتريات", parent: "5200", desc: "تأمين على الشحن والبضاعة أثناء النقل" },
  { code: "5290", name: "تكاليف أخرى", type: "مشتريات", parent: "5200", desc: "تكاليف استيراد أخرى غير مصنفة" },

  // ── حسابات مقابلة للمشتريات (Contra Purchases) ──
  { code: "5300", name: "مردودات ومسموحات مشتريات", type: "مشتريات", parent: "5100", is_contra: true, nature: "credit", desc: "مردودات مشتريات — تخفض تكلفة المشتريات" },
  { code: "5400", name: "خصم المشتريات المكتسب", type: "مشتريات", parent: "5100", is_contra: true, nature: "credit", desc: "خصومات مكتسبة من الموردين — تخفض تكلفة المشتريات" },

  // ═══════════ المصروفات التشغيلية (55xx-59xx) ═══════════
  { code: "5150", name: "رواتب وأجور", type: "مصاريف", parent: null, desc: "رواتب وأجور الموظفين والعمال" },
  { code: "5500", name: "مصروفات إدارية وعمومية", type: "مصاريف", parent: null, desc: "مصروفات إدارية وعمومية — الحساب الرئيسي" },
  { code: "5501", name: "مصروف إيجار", type: "مصاريف", parent: "5500", desc: "إيجار المقر أو المستودع أو الفرع" },
  { code: "5502", name: "مصروف كهرباء", type: "مصاريف", parent: "5500", desc: "فاتورة الكهرباء الشهرية للمنشأة" },
  { code: "5503", name: "مصروف غاز", type: "مصاريف", parent: "5500", desc: "فاتورة الغاز الشهرية" },
  { code: "5510", name: "مصاريف الصيانة", type: "مصاريف", parent: "5500", desc: "مصاريف صيانة المعدات والمباني" },
  { code: "5520", name: "مصاريف الضيافة", type: "مصاريف", parent: "5500", desc: "مصاريف ضيافة واستقبال الزوار والعملاء" },
  { code: "5530", name: "مصاريف التنقل والمواصلات", type: "مصاريف", parent: "5500", desc: "بدل تنقل وتذاكر سفر ومواصلات الموظفين" },
  { code: "5540", name: "مصاريف القرطاسية والطباعة", type: "مصاريف", parent: "5500", desc: "مستلزمات قرطاسية وطباعة ومطبوعات إدارية" },
  { code: "5550", name: "مصاريف البريد والشحن", type: "مصاريف", parent: "5500", desc: "مصاريف بريد وشحن مراسلات وطرود" },
  { code: "5560", name: "رسوم حكومية وتراخيص", type: "مصاريف", parent: "5500", desc: "رسوم حكومية وتجديد تراخيص تجارية وبلدية" },
  { code: "5570", name: "مصاريف تأمين", type: "مصاريف", parent: "5500", desc: "أقساط تأمين على الممتلكات والموظفين" },
  { code: "5580", name: "مصاريف هاتف وإنترنت", type: "مصاريف", parent: "5500", desc: "فواتير هاتف ثابت وجوال وإنترنت" },
  { code: "5590", name: "مصاريف الاستشارات", type: "مصاريف", parent: "5500", desc: "أتعاب مستشارين قانونيين وماليين وتقنيين" },
  { code: "5600", name: "مصاريف تسويق وإعلان", type: "مصاريف", parent: null, desc: "مصاريف تسويق وإعلان ووسائل التواصل" },
  { code: "5700", name: "مصروف استهلاك", type: "مصاريف", parent: null, desc: "إهلاك الأصول الثابتة للفترة المالية" },
  { code: "5800", name: "خسائر بيع أصول", type: "مصاريف", parent: null, desc: "خسائر من بيع أصول ثابتة بأقل من قيمتها الدفترية" },
  { code: "5810", name: "مصروف نقل وشحن", type: "مصاريف", parent: "5800", desc: "مصروف نقل وشحن البضاعة للعملاء" },
  { code: "5900", name: "مصروفات أخرى", type: "مصاريف", parent: null, desc: "مصروفات أخرى متنوعة — الحساب الرئيسي" },
  { code: "5910", name: "خصومات ممنوحة", type: "مصاريف", parent: "5900", desc: "خصومات منحتها المنشأة للعملاء عند السداد المبكر" },
  { code: "5920", name: "مصاريف بنكية", type: "مصاريف", parent: "5900", desc: "عمولات وخدمات بنكية مختلفة" },
  { code: "5930", name: "فروقات عملة", type: "مصاريف", parent: "5900", desc: "خسائر أو أرباح فروقات أسعار الصرف" },
  { code: "5940", name: "ضريبة الدخل", type: "مصاريف", parent: "5900", desc: "ضريبة الدخل المستحقة على أرباح الشركة" },
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

    let inserted = 0;
    for (let i = 0; i < accountsToInsert.length; i += 50) {
      const batch = accountsToInsert.slice(i, i + 50);
      const { data, error } = await supabaseAdmin
        .from('accounts')
        .upsert(batch, { onConflict: 'user_id,account_code', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error(`Batch error at ${i}:`, error);
      } else {
        inserted += (data?.length || 0);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `تم إنشاء ${inserted} حساب بنجاح`,
      created: inserted,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Setup accounts error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
