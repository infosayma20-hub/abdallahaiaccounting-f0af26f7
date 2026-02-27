import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch rates from frankfurter.app (free, no API key needed)
    // Base ILS: get how much 1 unit of foreign = X ILS
    const currencies = ['USD', 'EUR', 'JOD', 'GBP', 'EGP', 'TRY'];
    const ratesResponse = await fetch(`https://api.frankfurter.app/latest?from=ILS&to=${currencies.join(',')}`);
    
    if (!ratesResponse.ok) {
      throw new Error('Failed to fetch rates from API');
    }

    const ratesData = await ratesResponse.json();
    const today = new Date().toISOString().split('T')[0];

    // Get user's currencies
    const { data: userCurrencies } = await supabase
      .from('currencies')
      .select('id, code')
      .eq('user_id', user.id);

    if (!userCurrencies || userCurrencies.length === 0) {
      return new Response(JSON.stringify({ error: 'No currencies configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    for (const curr of userCurrencies) {
      if (curr.code === 'ILS') continue;
      
      const foreignRate = ratesData.rates?.[curr.code];
      if (!foreignRate) continue;

      // frankfurter returns: 1 ILS = X foreign
      // We need: 1 foreign = X ILS
      const ilsPerUnit = 1 / foreignRate;
      
      // Buy rate slightly lower, sell rate slightly higher (simulating spread)
      const spread = 0.005;
      const buyRate = ilsPerUnit * (1 - spread);
      const sellRate = ilsPerUnit * (1 + spread);

      const { error } = await supabase
        .from('exchange_rates')
        .upsert({
          currency_id: curr.id,
          rate_date: today,
          buy_rate: parseFloat(buyRate.toFixed(6)),
          sell_rate: parseFloat(sellRate.toFixed(6)),
          mid_rate: parseFloat(ilsPerUnit.toFixed(6)),
          source: 'auto_api',
          user_id: user.id,
        }, { onConflict: 'user_id,currency_id,rate_date' });

      if (!error) {
        results.push({ code: curr.code, mid_rate: parseFloat(ilsPerUnit.toFixed(6)) });
      }
    }

    return new Response(JSON.stringify({ success: true, rates: results, date: today }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
