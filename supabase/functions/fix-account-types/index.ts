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
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) throw new Error('Airtable not configured');

    // Fetch all accounts
    let allRecords: any[] = [];
    let url: string | null = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    while (url) {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
      const data = await res.json();
      allRecords = allRecords.concat(data.records || []);
      url = data.offset ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100&offset=${data.offset}` : null;
    }

    const toUpdate: { id: string; fields: Record<string, string> }[] = [];
    const toDelete: string[] = [];
    const seenCodes = new Map<string, string>(); // code -> first record id

    // Accounts that must be "Owner's Equity"
    const equityCodes = ["3100", "3200", "3300", "3400", "3500"];

    for (const rec of allRecords) {
      const name = (rec.fields["Account Name"] || "").trim();
      const type = rec.fields["Account Type"] || "";
      const match = name.match(/^(\d{4})\s*[-–]\s*/);
      const code = match ? match[1] : "";

      // Fix: move equity accounts from "Equity" to "Owner's Equity"
      if (code && equityCodes.includes(code) && type !== "Owner's Equity") {
        toUpdate.push({ id: rec.id, fields: { "Account Type": "Owner's Equity" } });
      }

      // Track duplicates by code
      if (code) {
        if (seenCodes.has(code)) {
          toDelete.push(rec.id);
        } else {
          seenCodes.set(code, rec.id);
        }
      }
    }

    // Batch update account types
    let totalUpdated = 0;
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10);
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: batch }),
      });
      if (!res.ok) throw new Error(`Update error: ${await res.text()}`);
      const result = await res.json();
      totalUpdated += result.records?.length || 0;
    }

    // Delete duplicates
    let totalDeleted = 0;
    for (let i = 0; i < toDelete.length; i += 10) {
      const batch = toDelete.slice(i, i + 10);
      const params = batch.map(id => `records[]=${id}`).join("&");
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?${params}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });
      if (!res.ok) throw new Error(`Delete error: ${await res.text()}`);
      const result = await res.json();
      totalDeleted += result.records?.length || 0;
    }

    return new Response(JSON.stringify({
      success: true,
      message: `تم تحديث ${totalUpdated} حساب وحذف ${totalDeleted} مكرر`,
      updated: totalUpdated,
      deleted: totalDeleted,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fix account types error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
