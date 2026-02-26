import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, corsHeaders, sanitizeForFormula } from "../_shared/auth.ts";

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

    const body = await req.json();
    const { clientName, contactEmail, phoneNumber, companyName, address, country, workField } = body;

    if (!clientName || !contactEmail) {
      throw new Error('Client name and contact email are required');
    }

    // Verify clientName matches authenticated user
    if (clientName !== authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safeClientName = sanitizeForFormula(clientName);
    const safeEmail = sanitizeForFormula(contactEmail);

    // Step 1: Search for existing client by UUID
    const searchByUUID = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula={Client Name}="${safeClientName}"&maxRecords=1`;
    const uuidRes = await fetch(searchByUUID, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (uuidRes.ok) {
      const uuidData = await uuidRes.json();
      if (uuidData.records && uuidData.records.length > 0) {
        const existingRecordId = uuidData.records[0].id;
        const existingFields = uuidData.records[0].fields;

        const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients/${existingRecordId}`;
        await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              "Phone Number": phoneNumber || existingFields["Phone Number"] || "",
              "Company Name": companyName || existingFields["Company Name"] || "",
              "Address": address || existingFields["Address"] || "",
              "Country": country || existingFields["Country"] || "",
              "Work Field": workField || existingFields["Work Field"] || "",
            },
          }),
        });

        return new Response(JSON.stringify({ success: true, existing: true, updated: true, data: uuidData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 2: Search by email as fallback
    const searchByEmail = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula={Contact Email}="${safeEmail}"&maxRecords=1`;
    const emailRes = await fetch(searchByEmail, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (emailRes.ok) {
      const emailData = await emailRes.json();
      if (emailData.records && emailData.records.length > 0) {
        const existingRecordId = emailData.records[0].id;

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

    // Step 3: Create new client
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients`;
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: {
            "Client Name": clientName,
            "Contact Email": contactEmail,
            "Phone Number": phoneNumber || "",
            "Company Name": companyName || "",
            "Address": address || "",
            "Country": country || "",
            "Work Field": workField || "",
          },
        }],
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
