import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map old account names to new coded names
const nameToCode: Record<string, string> = {
  "الصندوق": "1110 - الصندوق",
  "صندوق": "1110 - الصندوق",
  "البنك": "1120 - البنك",
  "بنك": "1120 - البنك",
  "البنك - الحساب الجاري": "1120 - البنك",
  "ذمم عملاء": "1130 - ذمم عملاء",
  "الذمم المدينة": "1130 - ذمم عملاء",
  "العملاء": "1130 - ذمم عملاء",
  "المخزون": "1140 - المخزون",
  "مخزون بضاعة": "1140 - المخزون",
  "البضاعة": "1140 - المخزون",
  "مركبات": "1210 - مركبات",
  "السيارات": "1210 - مركبات",
  "معدات وأجهزة": "1220 - معدات وأجهزة",
  "الأجهزة والحاسوب": "1220 - معدات وأجهزة",
  "المباني": "1230 - المباني",
  "أوراق القبض": "1150 - أوراق القبض",
  "المصاريف المدفوعة مقدماً": "1160 - المصاريف المدفوعة مقدماً",
  
  "ذمم موردين": "2110 - ذمم موردين",
  "الموردين": "2110 - ذمم موردين",
  "أوراق دفع": "2120 - أوراق دفع",
  "التزامات رواتب": "2130 - التزامات رواتب",
  "قروض بنكية": "2210 - قروض بنكية",
  
  "رأس المال": "3100 - رأس المال",
  "أرباح محتجزة": "3200 - أرباح محتجزة",
  "أرباح العام الحالي": "3300 - أرباح العام الحالي",
  "أرصدة افتتاحية": "3400 - أرصدة افتتاحية",
  
  "إيرادات مبيعات": "4100 - إيرادات مبيعات",
  "المبيعات": "4100 - إيرادات مبيعات",
  "إيرادات خدمات": "4200 - إيرادات خدمات",
  "إيرادات مشاريع": "4210 - إيرادات مشاريع",
  "إيرادات أخرى": "4300 - إيرادات أخرى",
  "مردودات مبيعات": "4400 - مردودات مبيعات",
  "مردودات مشتريات": "4500 - مردودات مشتريات",
  
  "تكلفة البضاعة المباعة": "5100 - تكلفة البضاعة المباعة",
  "مشتريات بضاعة": "5110 - مشتريات بضاعة",
  "رواتب وأجور": "5200 - رواتب وأجور",
  "الرواتب": "5200 - رواتب وأجور",
  "مصروف إيجار": "5300 - مصروف إيجار",
  "الإيجار": "5300 - مصروف إيجار",
  "كهرباء وماء": "5400 - كهرباء وماء",
  "مصروفات إدارية وعمومية": "5500 - مصروفات إدارية وعمومية",
  "مصاريف إدارية": "5500 - مصروفات إدارية وعمومية",
  "مصروف تسويق وإعلان": "5600 - مصروف تسويق وإعلان",
  "استهلاكات وإطفاءات": "5700 - استهلاكات وإطفاءات",
  "مصروف هاتف وإنترنت": "5800 - مصروف هاتف وإنترنت",
  "مصروف نقل وشحن": "5810 - مصروف نقل وشحن",
  "مصروف غاز": "5410 - مصروف غاز",
  "مصروف مواد خام": "5810 - مصروف مواد خام",
  "مصروف تغليف": "5820 - مصروف تغليف",
  "مصروف نظافة": "5830 - مصروف نظافة",
  "مصروف شحن وتوصيل": "5810 - مصروف شحن وتوصيل",
  "مصروف تسويق إلكتروني": "5820 - مصروف تسويق إلكتروني",
  "اشتراكات ومنصات": "5830 - اشتراكات ومنصات",
  "مصروف مواد بناء": "5810 - مصروف مواد بناء",
  "مصروف معدات": "5820 - مصروف معدات",
  "مقاولين من الباطن": "5830 - مقاولين من الباطن",
  "مصروف نقل": "5840 - مصروف نقل",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) throw new Error('Airtable not configured');

    // Fetch all accounts
    let allRecords: any[] = [];
    let url: string | null = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    while (url) {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
      const data = await res.json();
      allRecords = allRecords.concat(data.records || []);
      url = data.offset ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100&offset=${data.offset}` : null;
    }

    // Find accounts that need updating (no code prefix)
    const toUpdate: { id: string; fields: { "Account Name": string } }[] = [];
    for (const rec of allRecords) {
      const name = rec.fields["Account Name"] || "";
      // Skip if already has a code
      if (/^\d{4}\s*[-–]/.test(name)) continue;
      const coded = nameToCode[name.trim()];
      if (coded) {
        toUpdate.push({ id: rec.id, fields: { "Account Name": coded } });
      }
    }

    if (toUpdate.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "جميع الحسابات لديها أرقام بالفعل", updated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch update (max 10 per request)
    let totalUpdated = 0;
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10);
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: batch }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Airtable error: ${errText}`);
      }
      const result = await res.json();
      totalUpdated += result.records?.length || 0;
    }

    return new Response(JSON.stringify({ success: true, message: `تم تحديث ${totalUpdated} حساب`, updated: totalUpdated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fix account codes error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
