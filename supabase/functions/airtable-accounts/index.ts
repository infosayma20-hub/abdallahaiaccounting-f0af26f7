import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    
    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');

    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId') || '';
    
    // Fetch all accounts
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    const allAccounts = await fetchAllRecords(airtableUrl, AIRTABLE_API_KEY);

    if (clientId) {
      // Filter: show shared accounts (no Client) + accounts belonging to this client
      // Client field is a linked record - its display value is the Client Name (UUID)
      const filtered = allAccounts.filter((acc: any) => {
        const clientField = acc.fields["Client"];
        // No client = shared account
        if (!clientField || (Array.isArray(clientField) && clientField.length === 0)) {
          return true;
        }
        // Check if client name rollup or linked value matches
        const clientName = acc.fields["Client Name"] || acc.fields["Client name"];
        if (clientName) {
          if (Array.isArray(clientName)) {
            return clientName.includes(clientId);
          }
          return clientName === clientId;
        }
        // Fallback: check if Client linked record display includes the clientId
        if (Array.isArray(clientField)) {
          return clientField.some((c: string) => c === clientId || c.includes(clientId));
        }
        return String(clientField) === clientId || String(clientField).includes(clientId);
      });

      return new Response(JSON.stringify({ records: filtered }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ records: allAccounts }), {
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
