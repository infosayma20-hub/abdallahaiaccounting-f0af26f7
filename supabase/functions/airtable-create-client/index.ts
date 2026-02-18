import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');

    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');

    const body = await req.json();
    const { clientName, contactEmail, phoneNumber, companyName, address, country, workField } = body;

    if (!clientName || !contactEmail) {
      throw new Error('Client name and contact email are required');
    }

    // Step 1: Search for existing client by UUID (clientName) first, then by email
    const searchByUUID = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula={Client Name}="${clientName}"&maxRecords=1`;
    const uuidRes = await fetch(searchByUUID, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (uuidRes.ok) {
      const uuidData = await uuidRes.json();
      if (uuidData.records && uuidData.records.length > 0) {
        // Client already exists by UUID - return existing record
        console.log(`Client already exists with UUID: ${clientName}`);
        return new Response(JSON.stringify({ success: true, existing: true, data: uuidData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 2: Search by email as fallback
    const searchByEmail = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula={Contact Email}="${contactEmail}"&maxRecords=1`;
    const emailRes = await fetch(searchByEmail, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (emailRes.ok) {
      const emailData = await emailRes.json();
      if (emailData.records && emailData.records.length > 0) {
        // Client exists by email - update the UUID (Client Name) to link properly
        const existingRecordId = emailData.records[0].id;
        console.log(`Client found by email: ${contactEmail}, updating UUID to: ${clientName}`);
        
        const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients/${existingRecordId}`;
        await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              "Client Name": clientName,
              "Phone Number": phoneNumber || emailData.records[0].fields["Phone Number"] || "",
              "Company Name": companyName || emailData.records[0].fields["Company Name"] || "",
              "Address": address || emailData.records[0].fields["Address"] || "",
              "Country": country || emailData.records[0].fields["Country"] || "",
              "Work Field": workField || emailData.records[0].fields["Work Field"] || "",
            },
          }),
        });

        return new Response(JSON.stringify({ success: true, existing: true, updated: true, data: emailData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 3: Not found - create new client
    console.log(`Creating new client: ${clientName} (${contactEmail})`);
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients`;

    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              "Client Name": clientName,
              "Contact Email": contactEmail,
              "Phone Number": phoneNumber || "",
              "Company Name": companyName || "",
              "Address": address || "",
              "Country": country || "",
              "Work Field": workField || "",
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({ success: true, existing: false, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating client in Airtable:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
