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

    const url = new URL(req.url);
    const offset = url.searchParams.get('offset') || '';
    const clientId = url.searchParams.get('clientId') || '';
    const view = url.searchParams.get('view') || 'ملخص الحركات المحاسبية';
    
    // Build filter formula for client ID
    const filterFormula = clientId ? `&filterByFormula=${encodeURIComponent(`{Client}="${clientId}"`)}` : '';
    
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions?view=${encodeURIComponent(view)}&pageSize=100${filterFormula}${offset ? `&offset=${offset}` : ''}`;
    
    // Fetch all pages
    let allRecords: any[] = [];
    let currentUrl = airtableUrl;
    
    while (currentUrl) {
      const response = await fetch(currentUrl, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable API error [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      
      if (data.offset) {
        currentUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions?view=${encodeURIComponent(view)}&pageSize=100${filterFormula}&offset=${data.offset}`;
      } else {
        currentUrl = '';
      }
    }
    
    return new Response(JSON.stringify({ records: allRecords }), {
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
