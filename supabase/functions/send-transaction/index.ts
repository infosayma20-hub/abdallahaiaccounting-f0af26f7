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
    const { text, webhookUrl, userId, email, companyName } = await req.json();
    
    if (!text) throw new Error('Transaction text is required');
    if (!webhookUrl) throw new Error('Webhook URL is required');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        userId: userId || '',
        email: email || '',
        client_name: companyName || '',
        timestamp: new Date().toISOString(),
        source: 'web_app',
      }),
    });

    // Some webhooks don't return proper responses
    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = { status: response.status };
    }

    return new Response(JSON.stringify({ success: true, data: responseData }), {
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
