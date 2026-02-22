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

// Account templates by category
function getAccountsForSetup(req: SetupRequest): { name: string; type: string }[] {
  const accounts: { name: string; type: string }[] = [];

  // ── Core accounts (always created) ──
  accounts.push(
    { name: "صندوق", type: "Asset" },
    { name: "بنك", type: "Asset" },
    { name: "إيرادات مبيعات", type: "Revenue" },
    { name: "أرصدة افتتاحية", type: "Equity" },
    { name: "أرباح محتجزة", type: "Equity" },
    { name: "رأس المال", type: "Equity" },
  );

  // ── Receivables & Payables ──
  if (req.hasReceivables) {
    accounts.push(
      { name: "ذمم عملاء", type: "Asset" },
      { name: "ذمم موردين", type: "Liability" },
    );
  }

  // ── Inventory ──
  if (req.hasInventory) {
    accounts.push(
      { name: "مخزون بضاعة", type: "Asset" },
      { name: "تكلفة البضاعة المباعة", type: "Expenses" },
    );
  }

  // ── Employees ──
  if (req.hasEmployees) {
    accounts.push(
      { name: "رواتب وأجور", type: "Expenses" },
      { name: "التزامات رواتب", type: "Liability" },
    );
  }

  // ── Business-type specific expenses ──
  switch (req.businessType) {
    case "تجارة":
      accounts.push(
        { name: "مصروف إيجار", type: "Expenses" },
        { name: "مصروف كهرباء وماء", type: "Expenses" },
        { name: "مصروف نقل وشحن", type: "Expenses" },
        { name: "مصروف هاتف وإنترنت", type: "Expenses" },
        { name: "مصروفات عمومية", type: "Expenses" },
      );
      break;
    case "خدمات":
      accounts.push(
        { name: "مصروف إيجار", type: "Expenses" },
        { name: "مصروف كهرباء وماء", type: "Expenses" },
        { name: "مصروف هاتف وإنترنت", type: "Expenses" },
        { name: "مصروف تسويق وإعلان", type: "Expenses" },
        { name: "مصروفات عمومية", type: "Expenses" },
        { name: "إيرادات خدمات", type: "Revenue" },
      );
      break;
    case "مطعم":
      accounts.push(
        { name: "مصروف إيجار", type: "Expenses" },
        { name: "مصروف كهرباء وماء وغاز", type: "Expenses" },
        { name: "مصروف مواد خام", type: "Expenses" },
        { name: "مصروف تغليف", type: "Expenses" },
        { name: "مصروف نظافة", type: "Expenses" },
        { name: "مصروفات عمومية", type: "Expenses" },
      );
      break;
    case "متجر إلكتروني":
      accounts.push(
        { name: "مصروف شحن وتوصيل", type: "Expenses" },
        { name: "مصروف تسويق إلكتروني", type: "Expenses" },
        { name: "مصروف اشتراكات ومنصات", type: "Expenses" },
        { name: "مصروف تغليف", type: "Expenses" },
        { name: "مصروفات عمومية", type: "Expenses" },
        { name: "مردودات مبيعات", type: "Revenue" },
      );
      break;
    case "مقاولات":
      accounts.push(
        { name: "مصروف مواد بناء", type: "Expenses" },
        { name: "مصروف معدات", type: "Expenses" },
        { name: "مصروف مقاولين من الباطن", type: "Expenses" },
        { name: "مصروف نقل", type: "Expenses" },
        { name: "مصروفات عمومية", type: "Expenses" },
        { name: "إيرادات مشاريع", type: "Revenue" },
      );
      break;
    default: // أخرى
      accounts.push(
        { name: "مصروف إيجار", type: "Expenses" },
        { name: "مصروف كهرباء وماء", type: "Expenses" },
        { name: "مصروف هاتف وإنترنت", type: "Expenses" },
        { name: "مصروفات عمومية", type: "Expenses" },
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
    
    // Filter out already existing accounts
    const newAccounts = allAccounts.filter(a => !existingAccountNames.includes(a.name));

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
