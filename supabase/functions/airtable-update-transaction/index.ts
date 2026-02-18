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

    const { recordId, fields } = await req.json();

    if (!recordId) throw new Error('recordId is required');
    if (!fields || typeof fields !== 'object') throw new Error('fields object is required');

    // If debitAccountName or creditAccountName provided, resolve to record IDs
    const accountsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    const accRes = await fetch(accountsUrl, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (!accRes.ok) throw new Error('Failed to fetch accounts');
    const accData = await accRes.json();

    const accountNameToId: Record<string, string> = {};
    for (const acc of accData.records || []) {
      const name = acc.fields?.["Account Name"] || acc.fields?.["Name"];
      if (name) accountNameToId[name] = acc.id;
    }

    // Build the update fields
    const updateFields: Record<string, any> = {};

    if (fields.Description !== undefined) updateFields["Description"] = fields.Description;
    if (fields.Amount !== undefined) updateFields["Amount"] = Number(fields.Amount);
    if (fields["Transaction Type"] !== undefined) updateFields["Transaction Type"] = fields["Transaction Type"];
    if (fields.Date !== undefined) updateFields["Date"] = fields.Date;
    if (fields.Currency !== undefined) updateFields["Currency"] = fields.Currency;

    // Resolve account names to IDs for linked records
    if (fields["Debit Account Name"]) {
      const id = accountNameToId[fields["Debit Account Name"]];
      if (id) updateFields["Debit Account"] = [id];
      else throw new Error(`Debit account not found: ${fields["Debit Account Name"]}`);
    }

    if (fields["Credit Account Name"]) {
      const id = accountNameToId[fields["Credit Account Name"]];
      if (id) updateFields["Credit Account"] = [id];
      else throw new Error(`Credit account not found: ${fields["Credit Account Name"]}`);
    }

    // PATCH the record in Airtable
    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions/${recordId}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: updateFields }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error(`Airtable update failed [${patchRes.status}]: ${errText}`);
    }

    const result = await patchRes.json();

    return new Response(JSON.stringify({ success: true, data: result }), {
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
