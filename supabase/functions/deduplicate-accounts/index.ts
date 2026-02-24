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

    // Group by account code - keep first record, mark rest for deletion
    const codeMap = new Map<string, { keep: any; duplicates: string[] }>();
    const noCode: string[] = [];

    for (const rec of allRecords) {
      const name = (rec.fields["Account Name"] || "").trim();
      const match = name.match(/^(\d{4})\s*[-–]\s*/);
      if (!match) {
        noCode.push(`${rec.id}: ${name}`);
        continue;
      }
      const code = match[1];
      if (!codeMap.has(code)) {
        codeMap.set(code, { keep: rec, duplicates: [] });
      } else {
        codeMap.get(code)!.duplicates.push(rec.id);
      }
    }

    // Collect all duplicate IDs to delete
    const toDelete: string[] = [];
    for (const [, val] of codeMap) {
      toDelete.push(...val.duplicates);
    }

    if (toDelete.length === 0 && noCode.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "لا توجد حسابات مكررة", 
        deleted: 0,
        accountsWithoutCode: noCode,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete duplicates in batches of 10
    let totalDeleted = 0;
    for (let i = 0; i < toDelete.length; i += 10) {
      const batch = toDelete.slice(i, i + 10);
      const params = batch.map(id => `records[]=${id}`).join("&");
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?${params}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Airtable delete error: ${errText}`);
      }
      const result = await res.json();
      totalDeleted += result.records?.length || 0;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `تم حذف ${totalDeleted} حساب مكرر`,
      deleted: totalDeleted,
      accountsWithoutCode: noCode,
      totalRemaining: allRecords.length - totalDeleted,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Deduplicate error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

