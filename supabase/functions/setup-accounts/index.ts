import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SetupRequest {
  userId: string;
  businessType: string;
  hasInventory: boolean;
  hasReceivables: boolean;
  hasEmployees: boolean;
}

function getAccountsForSetup(req: SetupRequest): { name: string; type: string }[] {
  const accounts: { name: string; type: string }[] = [];

  // ══════════════════════════════════════════════
  // 1000 - ASSETS (الأصول)
  // ══════════════════════════════════════════════
  accounts.push(
    { name: "1110 - الصندوق", type: "Asset" },
    { name: "1120 - البنك", type: "Asset" },
  );
  if (req.hasReceivables) {
    accounts.push({ name: "1130 - ذمم عملاء", type: "Asset" });
  }
  if (req.hasInventory) {
    accounts.push({ name: "1140 - المخزون", type: "Asset" });
  }
  accounts.push(
    { name: "1210 - مركبات", type: "Asset" },
    { name: "1220 - معدات وأجهزة", type: "Asset" },
  );

  // ══════════════════════════════════════════════
  // 2000 - LIABILITIES (الالتزامات)
  // ══════════════════════════════════════════════
  if (req.hasReceivables) {
    accounts.push({ name: "2110 - ذمم موردين", type: "Liability" });
  }
  accounts.push(
    { name: "2120 - أوراق دفع", type: "Liability" },
  );
  if (req.hasEmployees) {
    accounts.push({ name: "2130 - التزامات رواتب", type: "Liability" });
  }
  accounts.push(
    { name: "2210 - قروض بنكية", type: "Liability" },
  );

  // ══════════════════════════════════════════════
  // 3000 - EQUITY (حقوق الملكية)
  // ══════════════════════════════════════════════
  accounts.push(
    { name: "3100 - رأس المال", type: "Owner's Equity" },
    { name: "3200 - أرباح محتجزة", type: "Owner's Equity" },
    { name: "3300 - أرباح العام الحالي", type: "Owner's Equity" },
    { name: "3400 - أرصدة افتتاحية", type: "Owner's Equity" },
  );

  // ══════════════════════════════════════════════
  // 4000 - REVENUES (الإيرادات)
  // ══════════════════════════════════════════════
  accounts.push(
    { name: "4100 - إيرادات مبيعات", type: "Revenue" },
  );
  if (req.businessType === "خدمات" || req.businessType === "مقاولات") {
    accounts.push({ name: "4200 - إيرادات خدمات", type: "Revenue" });
  }
  if (req.businessType === "مقاولات") {
    accounts.push({ name: "4210 - إيرادات مشاريع", type: "Revenue" });
  }
  accounts.push(
    { name: "4300 - إيرادات أخرى", type: "Revenue" },
    { name: "4400 - مردودات مبيعات", type: "Revenue" },
    { name: "4500 - مردودات مشتريات", type: "Revenue" },
  );

  // ══════════════════════════════════════════════
  // 5000 - EXPENSES (المصروفات)
  // ══════════════════════════════════════════════
  if (req.hasInventory) {
    accounts.push({ name: "5100 - تكلفة البضاعة المباعة", type: "Expenses" });
  }
  if (req.hasEmployees) {
    accounts.push({ name: "5200 - رواتب وأجور", type: "Expenses" });
  }
  accounts.push(
    { name: "5300 - مصروف إيجار", type: "Expenses" },
    { name: "5400 - كهرباء وماء", type: "Expenses" },
    { name: "5500 - مصروفات إدارية وعمومية", type: "Expenses" },
    { name: "5600 - مصروف تسويق وإعلان", type: "Expenses" },
    { name: "5700 - استهلاكات وإطفاءات", type: "Expenses" },
    { name: "5800 - مصروف هاتف وإنترنت", type: "Expenses" },
  );

  // Business-specific expenses
  switch (req.businessType) {
    case "تجارة":
      accounts.push(
        { name: "5810 - مصروف نقل وشحن", type: "Expenses" },
        { name: "5110 - مشتريات بضاعة", type: "Expenses" },
      );
      break;
    case "مطعم":
      accounts.push(
        { name: "5410 - مصروف غاز", type: "Expenses" },
        { name: "5810 - مصروف مواد خام", type: "Expenses" },
        { name: "5820 - مصروف تغليف", type: "Expenses" },
        { name: "5830 - مصروف نظافة", type: "Expenses" },
      );
      break;
    case "متجر إلكتروني":
      accounts.push(
        { name: "5810 - مصروف شحن وتوصيل", type: "Expenses" },
        { name: "5820 - مصروف تسويق إلكتروني", type: "Expenses" },
        { name: "5830 - اشتراكات ومنصات", type: "Expenses" },
        { name: "5840 - مصروف تغليف", type: "Expenses" },
      );
      break;
    case "مقاولات":
      accounts.push(
        { name: "5810 - مصروف مواد بناء", type: "Expenses" },
        { name: "5820 - مصروف معدات", type: "Expenses" },
        { name: "5830 - مقاولين من الباطن", type: "Expenses" },
        { name: "5840 - مصروف نقل", type: "Expenses" },
      );
      break;
  }

  return accounts;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');

    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');

    const body: SetupRequest = await req.json();
    const { userId } = body;

    if (!userId) throw new Error('userId is required');

    // First, get the Airtable Client record ID for this user
    const clientsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula={Name}="${userId}"&maxRecords=1`;
    const clientRes = await fetch(clientsUrl, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });
    const clientData = await clientRes.json();
    const clientRecordId = clientData.records?.[0]?.id;

    // Get existing accounts for this user to avoid duplicates
    let existingAccountNames: string[] = [];
    const existingUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?filterByFormula=OR({Client}=BLANK(),{Client}="${userId}")&fields[]=Account+Name`;
    const existingRes = await fetch(existingUrl, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });
    const existingData = await existingRes.json();
    existingAccountNames = (existingData.records || []).map((r: any) => r.fields["Account Name"]);

    // Generate accounts
    const allAccounts = getAccountsForSetup(body);
    
    // Filter out already existing accounts (check by code prefix or full name)
    const newAccounts = allAccounts.filter(a => {
      const code = a.name.split(" - ")[0]?.trim();
      return !existingAccountNames.some(existing => {
        const existingCode = existing.split(" - ")[0]?.trim();
        return existing === a.name || (code && existingCode && code === existingCode);
      });
    });

    if (newAccounts.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "جميع الحسابات موجودة بالفعل",
        created: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Airtable allows max 10 records per batch
    const batches: { name: string; type: string }[][] = [];
    for (let i = 0; i < newAccounts.length; i += 10) {
      batches.push(newAccounts.slice(i, i + 10));
    }

    let totalCreated = 0;

    for (const batch of batches) {
      const records = batch.map(acc => ({
        fields: {
          "Account Name": acc.name,
          "Account Type": acc.type,
          ...(clientRecordId ? { "Client": [clientRecordId] } : {}),
        },
      }));

      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Airtable batch error: ${errorText}`);
        throw new Error(`Airtable API error [${response.status}]`);
      }

      const result = await response.json();
      totalCreated += result.records?.length || 0;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `تم إنشاء ${totalCreated} حساب بنجاح`,
      created: totalCreated,
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
