import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    const { action, ...body } = await req.json();

    if (action === 'register-options') {
      if (!authHeader) throw new Error('Auth required');
      const supabaseUser = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) throw new Error('Unauthorized');

      const challenge = generateChallenge();
      await supabaseAdmin.from('webauthn_challenges').insert({
        user_id: user.id, challenge, type: 'registration'
      });

      // Get existing credentials to exclude
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
        Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) throw new Error('Unauthorized');

      const { credential, deviceName } = body;

      // Verify challenge exists
      const { data: challenges } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'registration')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!challenges?.length) throw new Error('No challenge found');

      // Store the credential
      await supabaseAdmin.from('passkey_credentials').insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: credential.publicKey,
        counter: 0,
        device_name: deviceName || 'جهازي',
      });

      // Clean up challenge
      await supabaseAdmin.from('webauthn_challenges')
        .delete()
        .eq('user_id', user.id)
        .eq('type', 'registration');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'auth-options') {
      const { email } = body;
      const challenge = generateChallenge();

      // Find user by email
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find(u => u.email === email);
      
      if (!user) throw new Error('User not found');

      const { data: credentials } = await supabaseAdmin
        .from('passkey_credentials')
        .select('credential_id')
        .eq('user_id', user.id);

      if (!credentials?.length) throw new Error('No passkeys registered');

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

      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find(u => u.email === email);
      if (!user) throw new Error('User not found');

      // Verify credential belongs to user
      const { data: cred } = await supabaseAdmin
        .from('passkey_credentials')
        .select('*')
        .eq('credential_id', credentialId)
        .eq('user_id', user.id)
        .single();

      if (!cred) throw new Error('Invalid credential');

      // Generate a magic link token for sign-in
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
      });

      if (signInError) throw signInError;

      // Clean up challenges
      await supabaseAdmin.from('webauthn_challenges')
        .delete()
        .eq('user_id', user.id)
        .eq('type', 'authentication');

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

    throw new Error('Invalid action');
  } catch (error) {
    console.error('WebAuthn error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
