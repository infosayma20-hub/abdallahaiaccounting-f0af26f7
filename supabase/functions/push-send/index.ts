// Edge function: push-send
// Service role. Sends FCM v1 push to all active device_tokens of a given user_id.
// Manual-test only in Phase 1 — not yet wired to any trigger.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

// --- OAuth2 access token from service account (JWT Bearer flow) ---
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

function base64UrlEncode(buf: ArrayBuffer | Uint8Array | string): string {
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

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const keyData = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth token failed: ${JSON.stringify(json)}`);
  }
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Authorization gate: service_role only ---
  // push-send must NEVER be callable with the public anon key. We require the
  // caller to present the service role key as a Bearer token and compare it
  // against SUPABASE_SERVICE_ROLE_KEY using a constant-time comparison to
  // mitigate timing attacks.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  const timingSafeEqual = (a: string, b: string): boolean => {
    const enc = new TextEncoder();
    const ab = enc.encode(a);
    const bb = enc.encode(b);
    if (ab.length !== bb.length) return false;
    let diff = 0;
    for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
    return diff === 0;
  };

  if (!serviceRoleKey || !presented || !timingSafeEqual(presented, serviceRoleKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, body, path } = await req.json();
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: "user_id, title, body required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!saRaw) {
      return new Response(JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sa: ServiceAccount = JSON.parse(saRaw);
    // Normalize PEM newlines if stored as a single-line JSON
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tokens, error: tErr } = await supabase
      .from("device_tokens")
      .select("id, token")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (tErr) throw tErr;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "No active tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    const results: Array<{ token: string; ok: boolean; error?: string }> = [];
    for (const t of tokens) {
      // IMPORTANT: data-only message (no top-level `notification` block).
      // If we include `notification`, FCM auto-displays the system notification
      // AND triggers onBackgroundMessage in the SW (which also calls
      // showNotification) → duplicate notifications on web/iOS PWA.
      // SW reads title/body/path from `data` and shows the notification once.
      const payload = {
        message: {
          token: t.token,
          data: {
            title: String(title),
            body: String(body),
            ...(path ? { path: String(path) } : {}),
          },
          webpush: {
            headers: { Urgency: "high" },
            ...(path ? { fcm_options: { link: String(path) } } : {}),
          },
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        results.push({ token: t.token, ok: true });
      } else {
        const errBody = await res.json().catch(() => ({}));
        const errCode =
          errBody?.error?.details?.[0]?.errorCode ||
          errBody?.error?.status ||
          String(res.status);
        // Deactivate dead tokens
        if (
          errCode === "UNREGISTERED" ||
          errCode === "NOT_FOUND" ||
          errCode === "INVALID_ARGUMENT" ||
          res.status === 404
        ) {
          await supabase
            .from("device_tokens")
            .update({ is_active: false })
            .eq("id", t.id);
        }
        results.push({ token: t.token, ok: false, error: errCode });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ ok: true, sent, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-send exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});