// Edge function: notifications-broadcast
// Admin-only. Creates a broadcast row, resolves audience -> user_ids,
// inserts notification_log rows, calls push-send for each recipient,
// and updates the broadcast with final counts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type AudienceType = "employees" | "department" | "role" | "company" | "portal";

interface BroadcastBody {
  title: string;
  body: string;
  path?: string;
  template_id?: string | null;
  audience_type: AudienceType;
  audience_filter?: {
    employee_ids?: string[];
    department_id?: string;
    role?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: callerId, _role: "super_admin" });
    const { data: isHR } = await admin.rpc("has_role", { _user_id: callerId, _role: "hr_manager" });
    if (!isAdmin && !isSuper && !isHR) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as BroadcastBody;
    const { title, body: messageBody, path, template_id, audience_type, audience_filter = {} } = body;
    if (!title || !messageBody || !audience_type) {
      return new Response(JSON.stringify({ error: "title, body, audience_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve caller's company_id from profiles (multi-tenant isolation)
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", callerId)
      .maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id ?? null;

    // ---- Resolve audience -> auth user_ids ----
    const recipientUserIds = new Set<string>();

    if (audience_type === "employees") {
      const ids = audience_filter.employee_ids ?? [];
      if (ids.length > 0) {
        let q = admin.from("employees").select("auth_user_id").in("id", ids);
        if (companyId) q = q.eq("company_id", companyId);
        const { data: emps } = await q;
        (emps ?? []).forEach((e: any) => e.auth_user_id && recipientUserIds.add(e.auth_user_id));
      }
    } else if (audience_type === "department") {
      const depId = audience_filter.department_id;
      if (depId) {
        let q = admin.from("employees").select("auth_user_id").eq("department_id", depId).eq("is_active", true);
        if (companyId) q = q.eq("company_id", companyId);
        const { data: emps } = await q;
        (emps ?? []).forEach((e: any) => e.auth_user_id && recipientUserIds.add(e.auth_user_id));
      }
    } else if (audience_type === "role") {
      const role = audience_filter.role;
      if (role) {
        const { data: ur } = await admin.from("user_roles").select("user_id").eq("role", role);
        const userIds = (ur ?? []).map((r: any) => r.user_id).filter(Boolean);
        if (userIds.length > 0 && companyId) {
          // scope to current company via profiles
          const { data: profs } = await admin
            .from("profiles")
            .select("id")
            .in("id", userIds)
            .eq("company_id", companyId);
          (profs ?? []).forEach((p: any) => recipientUserIds.add(p.id));
        } else {
          userIds.forEach((id: string) => recipientUserIds.add(id));
        }
      }
    } else if (audience_type === "company") {
      if (companyId) {
        const { data: emps } = await admin
          .from("employees")
          .select("auth_user_id")
          .eq("company_id", companyId)
          .eq("is_active", true);
        (emps ?? []).forEach((e: any) => e.auth_user_id && recipientUserIds.add(e.auth_user_id));
      }
    } else if (audience_type === "portal") {
      // بوابة الإدارة — مستخدمو malaki_portal_users التابعون لنفس مالك التينانت
      // نستخدم resolve_effective_owner_id لإيجاد صاحب الحساب الفعلي للمتصل،
      // ثم نطابق malaki_portal_users.user_id = ownerId (هذا الحقل يحتوي على owner uid).
      const { data: ownerData } = await admin.rpc("resolve_effective_owner_id", {
        _auth_uid: callerId,
      });
      const scopeOwnerId = (ownerData as string | null) ?? callerId;
      const { data: portals } = await admin
        .from("malaki_portal_users")
        .select("auth_user_id")
        .eq("is_active", true)
        .eq("user_id", scopeOwnerId)
        .not("auth_user_id", "is", null);
      (portals ?? []).forEach((p: any) => p.auth_user_id && recipientUserIds.add(p.auth_user_id));
      console.log(
        `[notifications-broadcast] portal audience: owner=${scopeOwnerId} portals_found=${(portals ?? []).length}`,
      );
    }

    const recipients = Array.from(recipientUserIds);

    // ---- Insert broadcast row ----
    const { data: broadcast, error: bErr } = await admin
      .from("notification_broadcasts")
      .insert({
        company_id: companyId,
        sent_by: callerId,
        template_id: template_id ?? null,
        title,
        body: messageBody,
        path: path ?? null,
        audience_type,
        audience_filter,
        recipients_count: recipients.length,
        status: "pending",
      })
      .select()
      .single();
    if (bErr) throw bErr;

    if (recipients.length === 0) {
      await admin
        .from("notification_broadcasts")
        .update({ status: "completed", completed_at: new Date().toISOString(), error_summary: "No recipients matched" })
        .eq("id", broadcast.id);
      return new Response(JSON.stringify({ ok: true, broadcast_id: broadcast.id, sent: 0, recipients: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Fire pushes in parallel (limited) ----
    let sent = 0, failed = 0;
    const logRows: any[] = [];

    const sendOne = async (userId: string) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, title, body: messageBody, path }),
        });
        const json = await res.json().catch(() => ({}));
        const ok = res.ok && (json.sent ?? 0) > 0;
        if (ok) sent++; else failed++;
        logRows.push({
          user_id: userId,
          type: "broadcast",
          channel: "push",
          title,
          body: messageBody,
          broadcast_id: broadcast.id,
          delivery_status: ok ? "delivered" : "failed",
          delivery_error: ok ? null : (json.note ?? json.error ?? `status ${res.status}`),
        });
      } catch (e) {
        failed++;
        logRows.push({
          user_id: userId,
          type: "broadcast",
          channel: "push",
          title,
          body: messageBody,
          broadcast_id: broadcast.id,
          delivery_status: "failed",
          delivery_error: String(e),
        });
      }
    };

    // Process in batches of 25 to avoid overwhelming
    const batchSize = 25;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      await Promise.all(batch.map(sendOne));
    }

    if (logRows.length > 0) {
      await admin.from("notification_log").insert(logRows);
    }

    const finalStatus = failed === 0 ? "completed" : sent === 0 ? "failed" : "partial";
    await admin
      .from("notification_broadcasts")
      .update({
        sent_count: sent,
        failed_count: failed,
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);

    return new Response(
      JSON.stringify({ ok: true, broadcast_id: broadcast.id, recipients: recipients.length, sent, failed, status: finalStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notifications-broadcast exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});