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

// ── WebAuthn crypto helpers ──
function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}
// Convert DER ECDSA signature to raw r||s (64 bytes for P-256)
function derToRawEcdsa(der: Uint8Array, size = 32): Uint8Array {
  if (der[0] !== 0x30) throw new Error("Invalid DER signature");
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) throw new Error("Invalid DER r");
  const rLen = der[offset + 1];
  let r = der.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (der[offset] !== 0x02) throw new Error("Invalid DER s");
  const sLen = der[offset + 1];
  let s = der.slice(offset + 2, offset + 2 + sLen);
  // Strip leading zero, then left-pad to size
  while (r.length > size && r[0] === 0) r = r.slice(1);
  while (s.length > size && s[0] === 0) s = s.slice(1);
  const out = new Uint8Array(size * 2);
  out.set(r, size - r.length);
  out.set(s, size * 2 - s.length);
  return out;
}
async function verifyAssertionSignature(params: {
  publicKeySpkiB64u: string;
  algorithm: number;
  authenticatorDataB64u: string;
  clientDataJsonB64u: string;
  signatureB64u: string;
}): Promise<boolean> {
  const { publicKeySpkiB64u, algorithm, authenticatorDataB64u, clientDataJsonB64u, signatureB64u } = params;
  const spki = b64urlToBytes(publicKeySpkiB64u);
  const authData = b64urlToBytes(authenticatorDataB64u);
  const clientData = b64urlToBytes(clientDataJsonB64u);
  const sigDer = b64urlToBytes(signatureB64u);
  const clientDataHash = await sha256(clientData);
  const signedData = new Uint8Array(authData.length + clientDataHash.length);
  signedData.set(authData, 0);
  signedData.set(clientDataHash, authData.length);

  if (algorithm === -7) {
    const key = await crypto.subtle.importKey(
      "spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    const rawSig = derToRawEcdsa(sigDer, 32);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, rawSig, signedData);
  }
  if (algorithm === -257) {
    const key = await crypto.subtle.importKey(
      "spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigDer, signedData);
  }
  return false;
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
        public_key_algorithm: credential.publicKeyAlgorithm ?? -7,
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
      const { credentialId, email, assertion } = body;

      if (!credentialId || !email || !assertion?.clientDataJSON || !assertion?.authenticatorData || !assertion?.signature) {
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
        .select('id, counter, public_key, public_key_algorithm')
        .eq('credential_id', credentialId)
        .eq('user_id', user.id)
        .single();

      if (!cred) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify a valid challenge exists and the assertion matches it
      const { data: validChallenges } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('id, challenge')
        .eq('user_id', user.id)
        .eq('type', 'authentication')
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (!validChallenges?.length) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Parse clientDataJSON and check type/challenge/origin
      let clientData: any;
      try {
        clientData = JSON.parse(bytesToString(b64urlToBytes(assertion.clientDataJSON)));
      } catch {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (clientData.type !== 'webauthn.get') {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const matchedChallenge = validChallenges.find(c => c.challenge === clientData.challenge);
      if (!matchedChallenge) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const expectedOriginHost = new URL(req.headers.get('origin') || req.url).hostname;
      const originHost = (() => { try { return new URL(clientData.origin).hostname; } catch { return ''; } })();
      if (!originHost || originHost !== expectedOriginHost) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify rpIdHash in authenticatorData
      const authDataBytes = b64urlToBytes(assertion.authenticatorData);
      if (authDataBytes.length < 37) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const expectedRpIdHash = await sha256(new TextEncoder().encode(expectedOriginHost));
      for (let i = 0; i < 32; i++) {
        if (authDataBytes[i] !== expectedRpIdHash[i]) {
          return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      // Require user-present flag
      const flags = authDataBytes[32];
      if ((flags & 0x01) === 0) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Cryptographic signature verification
      let signatureValid = false;
      try {
        signatureValid = await verifyAssertionSignature({
          publicKeySpkiB64u: cred.public_key,
          algorithm: cred.public_key_algorithm ?? -7,
          authenticatorDataB64u: assertion.authenticatorData,
          clientDataJsonB64u: assertion.clientDataJSON,
          signatureB64u: assertion.signature,
        });
      } catch (e) {
        console.error("WebAuthn signature verify error:", e);
        signatureValid = false;
      }
      if (!signatureValid) {
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // FIDO2 §6.1: Verify authenticator signCount strictly increases (clone detection)
      const signCount =
        (authDataBytes[33] << 24) |
        (authDataBytes[34] << 16) |
        (authDataBytes[35] << 8) |
        authDataBytes[36];
      const storedCounter = cred.counter ?? 0;
      if (signCount > 0 && signCount <= storedCounter) {
        console.warn("WebAuthn possible cloned authenticator", {
          credentialId: cred.id,
          signCount,
          storedCounter,
        });
        return new Response(JSON.stringify({ error: GENERIC_AUTH_ERROR }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

      // Update counter to the authenticator's reported signCount (per FIDO2 spec)
      await supabaseAdmin.from('passkey_credentials')
        .update({ counter: signCount > storedCounter ? signCount : storedCounter + 1 })
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
