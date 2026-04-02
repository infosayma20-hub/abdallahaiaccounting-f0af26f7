import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Try multiple free APIs to get rates for ILS-based pairs */
async function fetchRatesFromAPIs(codes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const remaining = new Set(codes);

  // Source 1: Frankfurter (ECB data — missing JOD, EGP, TRY)
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=ILS&to=${codes.join(',')}`);
    if (res.ok) {
      const data = await res.json();
      for (const [code, rate] of Object.entries(data.rates || {})) {
        if (typeof rate === 'number' && rate > 0) {
          result[code] = 1 / rate; // convert "1 ILS = X foreign" → "1 foreign = X ILS"
          remaining.delete(code);
        }
      }
    }
  } catch { /* ignore */ }

  // Source 2: fawazahmed0 currency-api (covers JOD, EGP, TRY, etc.)
  if (remaining.size > 0) {
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ils.json');
      if (res.ok) {
        const data = await res.json();
        const ilsRates = data.ils || {};
        for (const code of remaining) {
          const key = code.toLowerCase();
          if (ilsRates[key] && ilsRates[key] > 0) {
            result[code] = 1 / ilsRates[key]; // 1 foreign = X ILS
            remaining.delete(code);
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Source 3: fallback — try fetching each missing currency individually
  if (remaining.size > 0) {
    for (const code of remaining) {
      try {
        const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code.toLowerCase()}.json`);
        if (res.ok) {
          const data = await res.json();
          const rates = data[code.toLowerCase()] || {};
          if (rates.ils && rates.ils > 0) {
            result[code] = rates.ils; // already "1 foreign = X ILS"
            remaining.delete(code);
          }
        }
      } catch { /* ignore */ }
    }
  }

  return result;
}

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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get user's currencies
    const { data: userCurrencies } = await supabase
      .from('currencies')
      .select('id, code')
      .eq('user_id', user.id);

    if (!userCurrencies || userCurrencies.length === 0) {
      return new Response(JSON.stringify({ error: 'No currencies configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const foreignCodes = userCurrencies.filter(c => c.code !== 'ILS').map(c => c.code);
    const fetchedRates = await fetchRatesFromAPIs(foreignCodes);

    const today = new Date().toISOString().split('T')[0];
    const results: any[] = [];
    const failed: string[] = [];

    for (const curr of userCurrencies) {
      if (curr.code === 'ILS') continue;

      const ilsPerUnit = fetchedRates[curr.code];
      if (!ilsPerUnit) {
        failed.push(curr.code);
        continue;
      }

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

    return new Response(JSON.stringify({ success: true, rates: results, failed, date: today }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
