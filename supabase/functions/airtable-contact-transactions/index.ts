import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchAllRecords(baseUrl: string, apiKey: string): Promise<any[]> {
  let allRecords: any[] = [];
  let currentUrl = baseUrl;
  while (currentUrl) {
    const response = await fetch(currentUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`Airtable error [${response.status}]`);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    currentUrl = data.offset ? `${baseUrl.replace(/&offset=[^&]*/, '')}&offset=${data.offset}` : '';
  }
  return allRecords;
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

    const url = new URL(req.url);
    const contactId = url.searchParams.get('contactId') || '';
    const clientId = url.searchParams.get('clientId') || '';

    if (!contactId) throw new Error('contactId is required');

    // Fetch transactions filtered by Contact linked record
    const filterFormula = encodeURIComponent(`FIND("${contactId}", ARRAYJOIN(RECORD_ID(Contact)))`);
    
    // Since filtering by linked record ID is tricky, fetch all transactions for this client and filter
    const clientFilter = clientId ? `&filterByFormula=${encodeURIComponent(`{Client}="${clientId}"`)}` : '';
    const txUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions?view=${encodeURIComponent('ملخص الحركات المحاسبية')}&pageSize=100${clientFilter}`;
    const accountsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;

    const [allTx, allAccounts] = await Promise.all([
      fetchAllRecords(txUrl, AIRTABLE_API_KEY),
      fetchAllRecords(accountsUrl, AIRTABLE_API_KEY),
    ]);

    // Build account map
    const accountMap: Record<string, string> = {};
    for (const acc of allAccounts) {
      accountMap[acc.id] = acc.fields?.["Account Name"] || acc.id;
    }

    // Filter transactions that have this contact linked
    const contactTx = allTx.filter((tx: any) => {
      const contactField = tx.fields["Contact"];
      if (!contactField) return false;
      if (Array.isArray(contactField)) return contactField.includes(contactId);
      return contactField === contactId;
    });

    // Enrich with account names
    const enrichedTx = contactTx.map((tx: any) => {
      const fields = { ...tx.fields };
      if (Array.isArray(fields["Debit Account"])) {
        fields["Debit Account Name"] = fields["Debit Account"].map((id: string) => accountMap[id] || id).join(", ");
      }
      if (Array.isArray(fields["Credit Account"])) {
        fields["Credit Account Name"] = fields["Credit Account"].map((id: string) => accountMap[id] || id).join(", ");
      }
      return { ...tx, fields };
    });

    return new Response(JSON.stringify({ records: enrichedTx }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
