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

    if (req.method === 'POST') {
      // Create a new contact
      const body = await req.json();
      const { contactName, contactType, phone, email, company, address, clientRecordId } = body;

      if (!contactName) throw new Error('Contact name is required');

      const fields: Record<string, any> = {
        "Contact Name": contactName,
        "Contact Type": contactType || "",
        "Phone": phone || "",
        "Email": email || "",
        "Company": company || "",
        "Address": address || "",
        "Client Name": clientId,
      };

      if (clientRecordId) {
        fields["Client"] = [clientRecordId];
      }

      const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts`;
      const response = await fetch(airtableUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields }] }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable API error [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET: Fetch contacts for this client
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts?pageSize=100`;
    const allContacts = await fetchAllRecords(airtableUrl, AIRTABLE_API_KEY);

    if (clientId) {
      const filtered = allContacts.filter((c: any) => {
        const clientName = c.fields["Client Name"] || c.fields["Client name"];
        if (clientName) {
          if (Array.isArray(clientName)) return clientName.includes(clientId);
          return clientName === clientId;
        }
        const clientField = c.fields["Client"];
        if (!clientField || (Array.isArray(clientField) && clientField.length === 0)) return false;
        if (Array.isArray(clientField)) {
          return clientField.some((cf: string) => cf === clientId || cf.includes(clientId));
        }
        return String(clientField) === clientId;
      });
      return new Response(JSON.stringify({ records: filtered }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ records: allContacts }), {
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
