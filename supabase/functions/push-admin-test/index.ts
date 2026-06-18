// Edge function: push-admin-test
// Allows an authenticated admin to trigger a test push to ANY user_id (or by email).
// Reuses push-send internally with the service role key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    let { user_id, email, title, body: messageBody, path } = body as {
      user_id?: string; email?: string; title?: string; body?: string; path?: string;
    };
    if (!user_id && email) {
      const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (lErr) throw lErr;
      const u = list.users.find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase());
      if (!u) {
        return new Response(JSON.stringify({ error: "User not found for email" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user_id = u.id;
    }
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id or email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      user_id,
      title: title ?? "اختبار من أموالي 🎉",
      body: messageBody ?? "إذا وصلك هذا الإشعار، يعني كل شي تمام يا بطل! ✅",
      path: path ?? "/",
    };

    const sendRes = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: sendRes.ok, status: sendRes.status, target: user_id, result: sendJson }), {
      status: sendRes.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-admin-test exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});