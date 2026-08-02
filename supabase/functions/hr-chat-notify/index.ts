// Edge function: hr-chat-notify
// Authenticated. Called by HR right after sending a chat message.
// Resolves the thread's employee and pushes a mobile notification (FCM) to them.
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { thread_id, preview } = await req.json().catch(() => ({}));
    if (!thread_id) {
      return new Response(JSON.stringify({ error: "thread_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Thread must be readable by the caller (RLS) — verify through the user client.
    const { data: visible } = await userClient
      .from("hr_chat_threads")
      .select("id")
      .eq("id", thread_id)
      .maybeSingle();
    if (!visible) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: thread } = await admin
      .from("hr_chat_threads")
      .select("id, employee_id, unread_for_employee, last_message_preview, last_sender_type")
      .eq("id", thread_id)
      .maybeSingle();
    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employee } = await admin
      .from("employees")
      .select("id, auth_user_id, user_id")
      .eq("id", thread.employee_id)
      .maybeSingle();

    // The employee app authenticates through `auth_user_id`; `user_id` is a
    // legacy/secondary link kept only as a fallback.
    const targetUserId = employee?.auth_user_id || employee?.user_id || null;

    // Only notify the employee, and never notify the sender themselves.
    if (!targetUserId || targetUserId === callerId) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "No employee target" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendRes = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: targetUserId,
        title: "رسالة جديدة من الموارد البشرية 💬",
        body: String(preview || thread.last_message_preview || "لديك رسالة جديدة"),
        path: "/employee?tab=chat",
        badge: thread.unread_for_employee ?? 1,
      }),
    });
    const result = await sendRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: sendRes.ok, result }), {
      status: sendRes.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hr-chat-notify exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
