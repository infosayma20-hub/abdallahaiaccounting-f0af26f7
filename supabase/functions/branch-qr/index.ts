import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Compute HMAC-SHA256 based token
async function computeToken(branchId: string, timeWindow: number, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = `${branchId}:${timeWindow}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Compute static HMAC token (no time window — always same)
async function computeStaticToken(branchId: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = `${branchId}:static`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function getTimeWindow(rotationMinutes: number): number {
  const now = Date.now();
  return Math.floor(now / (rotationMinutes * 60 * 1000));
}

function getTimeWindowExpiry(rotationMinutes: number): string {
  const currentWindow = getTimeWindow(rotationMinutes);
  const expiryMs = (currentWindow + 1) * rotationMinutes * 60 * 1000;
  return new Date(expiryMs).toISOString();
}

// Constant-time string comparison to prevent timing attacks
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// UUID format validation
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = url.searchParams.get("action") || pathParts[pathParts.length - 1];

    // GET ?action=public&branch_id=xxx — Public QR generation (for display screens)
    if (req.method === "GET" && action === "public") {
      const branchId = url.searchParams.get("branch_id");
      if (!branchId || !isValidUUID(branchId)) {
        return new Response(JSON.stringify({ error: "branch_id مطلوب" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: branch, error: branchErr } = await supabase
        .from("branches")
        .select("id, qr_rotation_minutes, name, secret_key, is_active, qr_mode")
        .eq("id", branchId)
        .eq("is_active", true)
        .single();

      if (branchErr || !branch) {
        return new Response(JSON.stringify({ error: "الفرع غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isStatic = branch.qr_mode === 'static';

      if (isStatic) {
        const qrToken = await computeStaticToken(branch.id, branch.secret_key);
        return new Response(JSON.stringify({
          qr_payload: `${branch.id}:${qrToken}`,
          branch_name: branch.name,
          expires_at: null,
          rotation_minutes: 0,
          qr_mode: 'static',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Rotating mode
      const timeWindow = getTimeWindow(branch.qr_rotation_minutes);
      const qrToken = await computeToken(branch.id, timeWindow, branch.secret_key);
      const expiresAt = getTimeWindowExpiry(branch.qr_rotation_minutes);

      return new Response(JSON.stringify({
        qr_payload: `${branch.id}:${qrToken}`,
        branch_name: branch.name,
        expires_at: expiresAt,
        rotation_minutes: branch.qr_rotation_minutes,
        qr_mode: 'rotating',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET ?action=generate&branch_id=xxx — Authenticated QR generation
    if (req.method === "GET" && action === "generate") {
      const branchId = url.searchParams.get("branch_id");
      if (!branchId || !isValidUUID(branchId)) {
        return new Response(JSON.stringify({ error: "branch_id مطلوب" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: branch, error: branchErr } = await supabase
        .from("branches")
        .select("id, secret_key, qr_rotation_minutes, name, user_id, qr_mode")
        .eq("id", branchId)
        .eq("is_active", true)
        .single();

      if (branchErr || !branch) {
        return new Response(JSON.stringify({ error: "الفرع غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isOwner = branch.user_id === user.id;
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isOwner && !isAdmin) {
        return new Response(JSON.stringify({ error: "غير مصرح لعرض QR لهذا الفرع" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isStatic = branch.qr_mode === 'static';

      if (isStatic) {
        const qrToken = await computeStaticToken(branch.id, branch.secret_key);
        return new Response(JSON.stringify({
          qr_payload: `${branch.id}:${qrToken}`,
          branch_name: branch.name,
          expires_at: null,
          rotation_minutes: 0,
          qr_mode: 'static',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const timeWindow = getTimeWindow(branch.qr_rotation_minutes);
      const qrToken = await computeToken(branch.id, timeWindow, branch.secret_key);
      const expiresAt = getTimeWindowExpiry(branch.qr_rotation_minutes);

      return new Response(JSON.stringify({
        qr_payload: `${branch.id}:${qrToken}`,
        branch_name: branch.name,
        expires_at: expiresAt,
        rotation_minutes: branch.qr_rotation_minutes,
        qr_mode: 'rotating',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST ?action=validate — Validate a QR token
    if (req.method === "POST" && action === "validate") {
      const body = await req.json();
      const { branch_id, qr_token } = body;

      if (!branch_id || !qr_token || !isValidUUID(branch_id)) {
        return new Response(JSON.stringify({ valid: false, error: "بيانات ناقصة" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (typeof qr_token !== 'string' || !/^[0-9a-f]+$/i.test(qr_token) || qr_token.length > 128) {
        return new Response(JSON.stringify({ valid: false, error: "رمز غير صالح" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: branch, error: branchErr } = await supabase
        .from("branches")
        .select("id, secret_key, qr_rotation_minutes, qr_mode")
        .eq("id", branch_id)
        .eq("is_active", true)
        .single();

      if (branchErr || !branch) {
        return new Response(JSON.stringify({ valid: false, error: "الفرع غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isStatic = branch.qr_mode === 'static';

      if (isStatic) {
        // Static mode: validate against fixed token
        const staticToken = await computeStaticToken(branch.id, branch.secret_key);
        const isValid = constantTimeEqual(qr_token, staticToken);
        return new Response(JSON.stringify({ valid: isValid }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Rotating mode
      const currentWindow = getTimeWindow(branch.qr_rotation_minutes);
      const currentToken = await computeToken(branch.id, currentWindow, branch.secret_key);
      const prevToken = await computeToken(branch.id, currentWindow - 1, branch.secret_key);

      const isValid = constantTimeEqual(qr_token, currentToken) || constantTimeEqual(qr_token, prevToken);

      return new Response(JSON.stringify({ valid: isValid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "مسار غير موجود" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("branch-qr error:", err);
    return new Response(JSON.stringify({ error: "حدث خطأ في الخادم" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
