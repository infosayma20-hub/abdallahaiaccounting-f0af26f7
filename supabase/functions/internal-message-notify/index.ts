// Edge function: internal-message-notify
// Authenticated. Called by the sender right after sending an internal message.
// Pushes an FCM notification to every recipient (direct users + role members in the same tenant).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = u.user.id;

    const { message_id } = await req.json().catch(() => ({}));
    if (typeof message_id !== "string" || !/^[0-9a-f-]{36}$/i.test(message_id)) {
      return json({ error: "message_id required" }, 400);
    }
    const admin = createClient(url, serviceKey);
    const { data: msg } = await admin
      .from("internal_messages")
      .select("id, user_id, sender_id, sender_name, subject, priority")
      .eq("id", message_id).maybeSingle();
    if (!msg || msg.sender_id !== callerId) return json({ error: "Forbidden" }, 403);

    const { data: recs } = await admin
      .from("internal_message_recipients")
      .select("recipient_user_id, recipient_role")
      .eq("message_id", message_id);

    const targets = new Set<string>();
    const roles: string[] = [];
    for (const r of recs ?? []) {
      if (r.recipient_user_id) targets.add(r.recipient_user_id);
      else if (r.recipient_role) roles.push(r.recipient_role);
    }
    if (roles.length) {
      const owner = msg.user_id;
      const { data: team } = await admin.from("profiles").select("user_id")
        .or(`user_id.eq.${owner},invited_by.eq.${owner}`);
      const teamIds = (team ?? []).map((t: any) => t.user_id);
      if (teamIds.length) {
        const { data: rr } = await admin.from("user_roles").select("user_id")
          .in("role", roles).in("user_id", teamIds);
        (rr ?? []).forEach((x: any) => targets.add(x.user_id));
      }
    }
    targets.delete(callerId);

    let sent = 0;
    for (const uid of targets) {
      const res = await fetch(`${url}/functions/v1/push-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          title: `${msg.priority === "high" ? "🔴 " : ""}رسالة داخلية من ${msg.sender_name || "الفريق"}`,
          body: String(msg.subject || "لديك رسالة جديدة").slice(0, 150),
          path: "/internal-messages",
        }),
      });
      if (res.ok) sent++; else console.error("push-send failed", uid, res.status, await res.text());
    }
    return json({ ok: true, targets: targets.size, sent });
  } catch (e) {
    console.error("internal-message-notify exception:", e);
    return json({ error: String(e) }, 500);
  }
});
