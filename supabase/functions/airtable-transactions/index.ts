import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, corsHeaders, isValidUUID } from "../_shared/auth.ts";

async function fetchAllRecords(baseUrl: string, apiKey: string): Promise<any[]> {
  let allRecords: any[] = [];
  let currentUrl = baseUrl;

  while (currentUrl) {
    const response = await fetch(currentUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);

    if (data.offset) {
      const cleanUrl = baseUrl.replace(/&offset=[^&]*/, '');
      currentUrl = `${cleanUrl}&offset=${data.offset}`;
    } else {
      currentUrl = '';
    }
  }

  return allRecords;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate request
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const authenticatedUserId = authResult.userId;

    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    
    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');

    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId') || '';
    const view = url.searchParams.get('view') || 'ملخص الحركات المحاسبية';
    const showDeleted = url.searchParams.get('deleted') === 'true';
    
    // Validate clientId matches authenticated user
    if (clientId && !isValidUUID(clientId)) {
      return new Response(JSON.stringify({ error: 'Invalid clientId format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (clientId && clientId !== authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build filter: client UUID + deleted status
    // ARRAYJOIN({Client}) returns the primary field value (Client Name = UUID), not the record ID
    let filterParts: string[] = [];
    if (clientId) {
      filterParts.push(`FIND("${clientId}", ARRAYJOIN({Client}))`);
      console.log(`Filtering transactions by client UUID: ${clientId}`);
    }
    if (showDeleted) {
      filterParts.push(`{Deleted}=TRUE()`);
    } else {
      filterParts.push(`OR({Deleted}=BLANK(),{Deleted}=FALSE())`);
    }

    const filterFormula = filterParts.length > 1 
      ? `&filterByFormula=${encodeURIComponent(`AND(${filterParts.join(',')})`)}`
      : `&filterByFormula=${encodeURIComponent(filterParts[0])}`;
    
    const txUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions?view=${encodeURIComponent(view)}&pageSize=100${filterFormula}`;
    const accountsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;

    const [allTx, allAccounts] = await Promise.all([
      fetchAllRecords(txUrl, AIRTABLE_API_KEY),
      fetchAllRecords(accountsUrl, AIRTABLE_API_KEY),
    ]);

    // Build account ID -> Name map
    const accountMap: Record<string, string> = {};
    for (const acc of allAccounts) {
      accountMap[acc.id] = acc.fields?.["Account Name"] || acc.fields?.["Name"] || acc.id;
    }

    // Replace record IDs with account names in transactions
    const enrichedTx = allTx.map((tx: any) => {
      const fields = { ...tx.fields };

      if (Array.isArray(fields["Debit Account"])) {
        fields["Debit Account Name"] = fields["Debit Account"].map((id: string) => accountMap[id] || id).join(", ");
      } else if (typeof fields["Debit Account"] === "string") {
        fields["Debit Account Name"] = accountMap[fields["Debit Account"]] || fields["Debit Account"];
      }

      if (Array.isArray(fields["Credit Account"])) {
        fields["Credit Account Name"] = fields["Credit Account"].map((id: string) => accountMap[id] || id).join(", ");
      } else if (typeof fields["Credit Account"] === "string") {
        fields["Credit Account Name"] = accountMap[fields["Credit Account"]] || fields["Credit Account"];
      }

      return { ...tx, fields };
    });
    
    return new Response(JSON.stringify({ records: enrichedTx }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
