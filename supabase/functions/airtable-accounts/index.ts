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
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const authenticatedUserId = authResult.userId;

    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    
    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');

    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId') || '';
    
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

    // Fetch all accounts
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    const allAccounts = await fetchAllRecords(airtableUrl, AIRTABLE_API_KEY);

    if (clientId) {
      const filtered = allAccounts.filter((acc: any) => {
        const clientField = acc.fields["Client"];
        if (!clientField || (Array.isArray(clientField) && clientField.length === 0)) {
          return true;
        }
        const clientName = acc.fields["Client Name"] || acc.fields["Client name"];
        if (clientName) {
          if (Array.isArray(clientName)) {
            return clientName.includes(clientId);
          }
          return clientName === clientId;
        }
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
