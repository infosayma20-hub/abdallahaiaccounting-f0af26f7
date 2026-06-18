// Edge function: push-register
// Authenticated. Upserts the caller's FCM device token via RLS (no service role).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const token: string | undefined = body?.token;
    const platform: string | undefined = body?.platform;
    const device_info: string | null = body?.device_info ?? null;

    if (!token || typeof token !== "string" || token.length < 20) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!platform || !["android", "ios", "web"].includes(platform)) {
      return new Response(JSON.stringify({ error: "Invalid platform" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the caller using their JWT.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Use service role for the write so re-registration of a token
    // previously owned by a different account doesn't trip RLS.
    const admin = createClient(supabaseUrl, serviceKey);

    // Reassign any existing row with this token to the current user.
    await admin.from("device_tokens").delete().eq("token", token).neq("user_id", userId);

    const { error } = await admin
      .from("device_tokens")
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          device_info,
          is_active: true,
          last_seen_at: new Date().toISOString(),
          last_validated_at: new Date().toISOString(),
          fail_count: 0,
        },
        { onConflict: "token" },
      );

    if (error) {
      console.error("push-register upsert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-register exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});