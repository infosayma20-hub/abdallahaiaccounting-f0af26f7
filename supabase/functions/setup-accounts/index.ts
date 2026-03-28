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
const DEFAULT_ACCOUNTS: { code: string; name: string; type: string; parent: string | null }[] = [
  // ═══════════ الأصول المتداولة (11xx) ═══════════
  { code: "1110", name: "الصندوق", type: "أصول", parent: null },
  { code: "1111", name: "صندوق الدولار", type: "أصول", parent: "1110" },
  { code: "1112", name: "صندوق الدينار", type: "أصول", parent: "1110" },
  { code: "1113", name: "صندوق اليورو", type: "أصول", parent: "1110" },
  { code: "1114", name: "صندوق الجنيه المصري", type: "أصول", parent: "1110" },
  { code: "1120", name: "البنك", type: "أصول", parent: null },
  { code: "1121", name: "بنك 1", type: "أصول", parent: "1120" },
  { code: "1122", name: "بنك 2 - حساب التوفير", type: "أصول", parent: "1120" },
  { code: "1123", name: "بنك 3 - حساب جاري شيكل", type: "أصول", parent: "1120" },
  { code: "1124", name: "بنك 4 - حساب جاري دولار", type: "أصول", parent: "1120" },
  { code: "1125", name: "بنك 5 - حساب جاري دينار", type: "أصول", parent: "1120" },
  { code: "1130", name: "ذمم عملاء", type: "أصول", parent: null },
  { code: "1140", name: "المخزون", type: "أصول", parent: null },
  { code: "1150", name: "شيكات واردة", type: "أصول", parent: null },
  { code: "1160", name: "المصاريف المدفوعة مقدماً", type: "أصول", parent: null },
  { code: "1170", name: "التأمينات المدفوعة", type: "أصول", parent: null },
  { code: "2180", name: "ذمم موظفين", type: "التزامات", parent: "2100" },

  // ═══════════ الأصول غير المتداولة (12xx) ═══════════
  { code: "1210", name: "مركبات", type: "أصول", parent: null },
  { code: "1220", name: "معدات وأجهزة", type: "أصول", parent: null },
  { code: "1230", name: "المباني", type: "أصول", parent: null },
  { code: "1250", name: "الأراضي", type: "أصول", parent: null },
  { code: "1290", name: "مجمع الاستهلاك", type: "أصول", parent: null },

  // ═══════════ الالتزامات المتداولة (21xx) ═══════════
  { code: "2110", name: "ذمم موردين", type: "خصوم", parent: null },
  { code: "2120", name: "شيكات صادرة", type: "خصوم", parent: null },
  { code: "2130", name: "الرواتب المستحقة", type: "خصوم", parent: null },
  { code: "2140", name: "الضرائب المستحقة", type: "خصوم", parent: null },
  { code: "2150", name: "الإيجار المستحق", type: "خصوم", parent: null },
  { code: "2160", name: "الكهرباء والماء المستحق", type: "خصوم", parent: null },
  { code: "2170", name: "القروض قصيرة الأجل", type: "خصوم", parent: null },

  // ═══════════ الالتزامات غير المتداولة (22xx) ═══════════
  { code: "2210", name: "قروض بنكية", type: "خصوم", parent: null },
  { code: "2220", name: "القروض طويلة الأجل", type: "خصوم", parent: null },

  // ═══════════ حقوق الملكية (3xxx) ═══════════
  { code: "3100", name: "رأس المال", type: "حقوق ملكية", parent: null },
  { code: "3200", name: "أرباح محتجزة", type: "حقوق ملكية", parent: null },
  { code: "3300", name: "الأرباح والخسائر", type: "حقوق ملكية", parent: null },
  { code: "3400", name: "أرصدة افتتاحية", type: "حقوق ملكية", parent: null },
  { code: "3500", name: "المسحوبات الشخصية", type: "حقوق ملكية", parent: null },

  // ═══════════ الإيرادات (4xxx) ═══════════
  { code: "4100", name: "إيرادات مبيعات", type: "إيرادات", parent: null },
  { code: "4200", name: "إيرادات خدمات", type: "إيرادات", parent: null },
  { code: "4300", name: "إيرادات أخرى", type: "إيرادات", parent: null },
  { code: "4310", name: "إيرادات متنوعة", type: "إيرادات", parent: "4300" },
  { code: "4320", name: "إيرادات الإيجار", type: "إيرادات", parent: "4300" },
  { code: "4330", name: "إيرادات الفوائد", type: "إيرادات", parent: "4300" },
  { code: "4340", name: "أرباح بيع الأصول", type: "إيرادات", parent: "4300" },
  { code: "4350", name: "خصومات مكتسبة", type: "إيرادات", parent: "4300" },
  { code: "4360", name: "إيرادات رواتب وأجور", type: "إيرادات", parent: "4300" },
  { code: "4400", name: "مردودات مبيعات", type: "إيرادات", parent: null },
  { code: "4500", name: "مردودات مشتريات", type: "إيرادات", parent: null },

  // ═══════════ تكلفة المبيعات والمشتريات (51xx) ═══════════
  { code: "5100", name: "تكلفة البضاعة المباعة", type: "مشتريات", parent: null },
  { code: "5110", name: "المشتريات", type: "مشتريات", parent: "5100" },

  // ═══════════ تكاليف الاستيراد (52xx) ═══════════
  { code: "5200", name: "تكاليف استيراد", type: "مشتريات", parent: "5100" },
  { code: "5210", name: "تكاليف شحن", type: "مشتريات", parent: "5200" },
  { code: "5220", name: "جمارك ورسوم", type: "مشتريات", parent: "5200" },
  { code: "5230", name: "تكاليف تخليص جمركي", type: "مشتريات", parent: "5200" },
  { code: "5240", name: "رسوم مرفأ", type: "مشتريات", parent: "5200" },
  { code: "5250", name: "مكتب خارجي", type: "مشتريات", parent: "5200" },
  { code: "5260", name: "نقل داخلي", type: "مشتريات", parent: "5200" },
  { code: "5270", name: "تخزين", type: "مشتريات", parent: "5200" },
  { code: "5280", name: "تأمين شحن", type: "مشتريات", parent: "5200" },
  { code: "5290", name: "تكاليف أخرى", type: "مشتريات", parent: "5200" },

  // ═══════════ المصروفات التشغيلية (53xx-59xx) ═══════════
  { code: "5150", name: "رواتب وأجور", type: "مصاريف", parent: null },
  { code: "5300", name: "مصروف إيجار", type: "مصاريف", parent: null },

  // ═══════════ تكاليف الورشات (535x) ═══════════
  { code: "5350", name: "تكاليف الورشات", type: "مصاريف", parent: null },
  { code: "5351", name: "مواد خام (خشب)", type: "مصاريف", parent: "5350" },
  { code: "5352", name: "دهان ومواد تشطيب", type: "مصاريف", parent: "5350" },
  { code: "5353", name: "أجور عمال الورشات", type: "مصاريف", parent: "5350" },
  { code: "5354", name: "نقل وتوصيل ورشات", type: "مصاريف", parent: "5350" },
  { code: "5359", name: "تكاليف ورشات أخرى", type: "مصاريف", parent: "5350" },

  { code: "5400", name: "مصروف كهرباء", type: "مصاريف", parent: "5500" },
  { code: "5410", name: "مصروف غاز", type: "مصاريف", parent: "5500" },
  { code: "5500", name: "مصروفات إدارية وعمومية", type: "مصاريف", parent: null },
  { code: "5510", name: "مصاريف الصيانة", type: "مصاريف", parent: "5500" },
  { code: "5520", name: "مصاريف الضيافة", type: "مصاريف", parent: "5500" },
  { code: "5530", name: "مصاريف التنقل والمواصلات", type: "مصاريف", parent: "5500" },
  { code: "5540", name: "مصاريف القرطاسية والطباعة", type: "مصاريف", parent: "5500" },
  { code: "5550", name: "مصاريف البريد والشحن", type: "مصاريف", parent: "5500" },
  { code: "5560", name: "رسوم حكومية وتراخيص", type: "مصاريف", parent: "5500" },
  { code: "5570", name: "مصاريف تأمين", type: "مصاريف", parent: "5500" },
  { code: "5580", name: "مصاريف هاتف وإنترنت", type: "مصاريف", parent: "5500" },
  { code: "5590", name: "مصاريف الاستشارات", type: "مصاريف", parent: "5500" },
  { code: "5600", name: "مصاريف تسويق وإعلان", type: "مصاريف", parent: null },
  { code: "5700", name: "مصروف استهلاك", type: "مصاريف", parent: null },
  { code: "5800", name: "خسائر بيع أصول", type: "مصاريف", parent: null },
  { code: "5810", name: "مصروف نقل وشحن", type: "مصاريف", parent: "5800" },
  { code: "5900", name: "مصروفات أخرى", type: "مصاريف", parent: null },
  { code: "5910", name: "خصومات ممنوحة", type: "مصاريف", parent: "5900" },
  { code: "5920", name: "مصاريف بنكية", type: "مصاريف", parent: "5900" },
  { code: "5930", name: "فروقات عملة", type: "مصاريف", parent: "5900" },
  { code: "5940", name: "ضريبة الدخل", type: "مصاريف", parent: "5900" },
  { code: "5950", name: "غرامات وجزاءات", type: "مصاريف", parent: "5900" },
  { code: "5960", name: "ديون معدومة", type: "مصاريف", parent: "5900" },

  // ═══════════ مصاريف مالية (6xxx) ═══════════
  { code: "6100", name: "مصاريف فوائد بنكية", type: "مصاريف", parent: null },
  { code: "6110", name: "عمولات بنكية", type: "مصاريف", parent: "6100" },
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
