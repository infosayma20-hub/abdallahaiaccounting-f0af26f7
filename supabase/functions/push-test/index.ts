// Edge function: push-test
// Sends a test FCM push to the currently authenticated user's active devices.
// Auth: requires a valid user JWT (Bearer). No service role required from caller.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

let cachedToken: { token: string; exp: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function b64u(buf: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buf === "string") bytes = new TextEncoder().encode(buf);
  else if (buf instanceof Uint8Array) bytes = buf;
  else bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claim))}`;
  const keyData = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64u(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`OAuth failed: ${JSON.stringify(json)}`);
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.slice("Bearer ".length).trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!saRaw) {
      return new Response(JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sa: ServiceAccount = JSON.parse(saRaw);
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: tokens, error: tErr } = await admin
      .from("device_tokens")
      .select("id, token, platform")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (tErr) throw tErr;

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no active device tokens for this user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    const title = "اختبار من أموالي 🎉";
    const body = "إذا وصلك هذا الإشعار يعني كل شي تمام!";

    const results: Array<{ token: string; ok: boolean; error?: string }> = [];
    for (const t of tokens) {
      const payload = {
        message: {
          token: t.token,
          notification: { title, body },
          webpush: { fcm_options: { link: "/" } },
        },
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        results.push({ token: t.token.slice(0, 16) + "…", ok: true });
      } else {
        const errBody = await r.json().catch(() => ({}));
        const errCode =
          errBody?.error?.details?.[0]?.errorCode ||
          errBody?.error?.status ||
          String(r.status);
        if (errCode === "UNREGISTERED" || errCode === "NOT_FOUND" || errCode === "INVALID_ARGUMENT" || r.status === 404) {
          await admin.from("device_tokens").update({ is_active: false }).eq("id", t.id);
        }
        results.push({ token: t.token.slice(0, 16) + "…", ok: false, error: errCode });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ ok: true, sent, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-test exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});