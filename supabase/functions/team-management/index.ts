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
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create_team_member') {
      const { email: rawEmail, password, full_name, role } = body;
      const email = (rawEmail || '').trim().toLowerCase();

      if (!email || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ error: 'صيغة البريد الإلكتروني غير صحيحة' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create user via admin API
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newUserId = newUser.user.id;

      // Update profile with invited_by and full_name
      await supabaseAdmin.from('profiles').update({
        invited_by: caller.id,
        full_name,
        display_name: full_name,
        setup_completed: true,
      }).eq('user_id', newUserId);

      // Remove auto-assigned admin role first
      await supabaseAdmin.from('user_roles').delete().eq('user_id', newUserId);

      // Assign the specified role
      await supabaseAdmin.from('user_roles').insert({
        user_id: newUserId,
        role,
      });

      return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'suspend_team_member') {
      const { target_user_id, suspend } = body;

      // Verify target is a team member
      const { data: profile } = await supabaseAdmin.from('profiles')
        .select('invited_by').eq('user_id', target_user_id).single();

      if (!profile || profile.invited_by !== caller.id) {
        return new Response(JSON.stringify({ error: 'Not your team member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update suspension status
      await supabaseAdmin.from('profiles').update({ is_suspended: suspend })
        .eq('user_id', target_user_id);

      // Also ban/unban in auth
      if (suspend) {
        await supabaseAdmin.auth.admin.updateUserById(target_user_id, { ban_duration: '876600h' });
      } else {
        await supabaseAdmin.auth.admin.updateUserById(target_user_id, { ban_duration: 'none' });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_team_role') {
      const { target_user_id, new_role } = body;

      const { data: profile } = await supabaseAdmin.from('profiles')
        .select('invited_by').eq('user_id', target_user_id).single();

      if (!profile || profile.invited_by !== caller.id) {
        return new Response(JSON.stringify({ error: 'Not your team member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabaseAdmin.from('user_roles').delete().eq('user_id', target_user_id);
      await supabaseAdmin.from('user_roles').insert({ user_id: target_user_id, role: new_role });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_team_members') {
      // Get all team members (profiles where invited_by = caller)
      const { data: members } = await supabaseAdmin.from('profiles')
        .select('user_id, display_name, full_name, is_suspended, last_seen_at, created_at')
        .eq('invited_by', caller.id);

      // Get their roles
      const memberIds = (members || []).map(m => m.user_id);
      const { data: roles } = await supabaseAdmin.from('user_roles')
        .select('user_id, role')
        .in('user_id', memberIds.length > 0 ? memberIds : ['00000000-0000-0000-0000-000000000000']);

      // Get emails from auth
      const enriched = [];
      for (const m of (members || [])) {
        const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        const memberRoles = (roles || []).filter(r => r.user_id === m.user_id).map(r => r.role);
        enriched.push({
          ...m,
          email: authUser?.email || '',
          roles: memberRoles,
          is_online: m.last_seen_at ? (new Date().getTime() - new Date(m.last_seen_at).getTime()) < 5 * 60 * 1000 : false,
        });
      }

      return new Response(JSON.stringify({ members: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
