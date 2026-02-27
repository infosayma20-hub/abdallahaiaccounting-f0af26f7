import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generic error message to prevent user enumeration
const GENERIC_AUTH_ERROR = "بيانات الاعتماد غير صالحة أو لم يتم العثور على مفتاح مرور";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    const { action, ...body } = await req.json();

    // Validate action is one of the allowed values
    const allowedActions = ['register-options', 'register-verify', 'auth-options', 'auth-verify'];
    if (!allowedActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'register-options') {
      if (!authHeader) throw new Error('Auth required');
      const supabaseUser = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) throw new Error('Unauthorized');

      const challenge = generateChallenge();
      await supabaseAdmin.from('webauthn_challenges').insert({
        user_id: user.id, challenge, type: 'registration'
      });

      const { data: existing } = await supabaseAdmin
        .from('passkey_credentials')
        .select('credential_id')
        .eq('user_id', user.id);

      return new Response(JSON.stringify({
        challenge,
        rp: { name: 'عبدالله AI للمحاسبة', id: new URL(req.headers.get('origin') || req.url).hostname },
        user: { id: user.id, name: user.email, displayName: user.email },
        excludeCredentials: (existing || []).map(c => ({ id: c.credential_id, type: 'public-key' })),
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        timeout: 60000,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'register-verify') {
      if (!authHeader) throw new Error('Auth required');
      const supabaseUser = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) throw new Error('Unauthorized');

      const { credential, deviceName } = body;

      // Verify challenge exists and is recent (10 min max)
      const { data: challenges } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'registration')
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (!challenges?.length) throw new Error('No valid challenge found');

      // Sanitize device name
      const sanitizedDeviceName = (deviceName || 'جهازي').slice(0, 50).replace(/[<>"'&]/g, '');

      await supabaseAdmin.from('passkey_credentials').insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: credential.publicKey,
        counter: 0,
        device_name: sanitizedDeviceName,
      });

      // Clean up ALL challenges for this user (not just registration)
      await supabaseAdmin.from('webauthn_challenges')
        .delete()
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'auth-options') {
      const { email } = body;
      
      // Validate email format
      if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 255) {
        // Return generic error - don't reveal validation details
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const challenge = generateChallenge();

      // Find user by email
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find(u => u.email === email);
      
      // SECURITY: Return same generic error whether user exists or not
      if (!user) {
        // Simulate same delay to prevent timing attacks
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: credentials } = await supabaseAdmin
        .from('passkey_credentials')
        .select('credential_id')
        .eq('user_id', user.id);

      // SECURITY: Same generic error if no passkeys - prevents enumeration
      if (!credentials?.length) {
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabaseAdmin.from('webauthn_challenges').insert({
        user_id: user.id, challenge, type: 'authentication'
      });

      return new Response(JSON.stringify({
        challenge,
        rpId: new URL(req.headers.get('origin') || req.url).hostname,
        allowCredentials: credentials.map(c => ({ id: c.credential_id, type: 'public-key' })),
        userVerification: 'required',
        timeout: 60000,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'auth-verify') {
      const { credentialId, email } = body;

      if (!credentialId || !email) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find(u => u.email === email);
      
      // SECURITY: Generic error
      if (!user) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify credential belongs to user
      const { data: cred } = await supabaseAdmin
        .from('passkey_credentials')
        .select('*')
        .eq('credential_id', credentialId)
        .eq('user_id', user.id)
        .single();

      if (!cred) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify a valid challenge exists and is recent
      const { data: validChallenge } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'authentication')
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1);

      if (!validChallenge?.length) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate a magic link token for sign-in
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
      });

      if (signInError) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Clean up ALL challenges for this user
      await supabaseAdmin.from('webauthn_challenges')
        .delete()
        .eq('user_id', user.id);

      // Update counter
      await supabaseAdmin.from('passkey_credentials')
        .update({ counter: cred.counter + 1 })
        .eq('id', cred.id);

      return new Response(JSON.stringify({
        success: true,
        token: signInData?.properties?.hashed_token,
        actionLink: signInData?.properties?.action_link,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('WebAuthn error:', error);
    // SECURITY: Never expose internal error details
    return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
