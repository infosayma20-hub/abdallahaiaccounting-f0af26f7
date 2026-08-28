import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Auth gate: writes campaign data with service role, so require an admin JWT ---
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } as any };
    const caller = userData?.user;
    if (!caller) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      admin.rpc('has_role', { _user_id: caller.id, _role: 'admin' }),
      admin.rpc('has_role', { _user_id: caller.id, _role: 'super_admin' }),
    ]);
    if (!isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { slug, rows, clear } = body as {
      slug: string;
      rows: Array<Record<string, unknown>>;
      clear?: boolean;
    };
    if (!slug || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: 'slug and rows required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: camp, error: cErr } = await admin
      .from('marketing_campaigns')
      .select('id')
      .eq('slug', slug)
      .single();
    if (cErr || !camp) {
      return new Response(JSON.stringify({ error: 'campaign not found', slug }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (clear) {
      await admin.from('marketing_campaign_sales').delete().eq('campaign_id', camp.id);
    }
    const payload = rows.map((r) => ({ ...r, campaign_id: camp.id }));
    // insert in chunks of 500
    let inserted = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await admin.from('marketing_campaign_sales').insert(chunk);
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message, at: i, inserted }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      inserted += chunk.length;
    }
    return new Response(JSON.stringify({ ok: true, inserted, slug }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});