// Edge function: notify-employee-meal
// Called from POS after recording an employee meal deduction.
// Validates caller JWT, ensures employee belongs to same data owner,
// then invokes push-send (service role) to deliver an FCM push instantly.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const {
      employee_id,
      data_owner_id,
      order_number,
      full_amount,
      employee_share_pct,
      deducted_amount,
      items_summary,
      discount_label,
    } = body || {};

    if (!employee_id || !data_owner_id || typeof deducted_amount !== "number") {
      return new Response(JSON.stringify({ error: "employee_id, data_owner_id, deducted_amount required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorization: caller must belong to the same data owner (multi-tenant guard).
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id, owner_id, company_id")
      .eq("id", callerId)
      .maybeSingle();
    const callerOwner = (callerProfile as any)?.owner_id || callerId;
    if (callerOwner !== data_owner_id && callerId !== data_owner_id) {
      return new Response(JSON.stringify({ error: "Forbidden: owner mismatch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve employee auth_user_id, and confirm they belong to the same owner.
    const { data: emp, error: empErr } = await admin
      .from("employees")
      .select("id, full_name, auth_user_id, user_id")
      .eq("id", employee_id)
      .maybeSingle();
    if (empErr || !emp) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((emp as any).user_id && (emp as any).user_id !== data_owner_id) {
      return new Response(JSON.stringify({ error: "Employee/owner mismatch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipient = (emp as any).auth_user_id;
    if (!recipient) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "Employee has no linked auth account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = discount_label
      ? `🍽️ ${discount_label} من حسابك`
      : "🍽️ تم خصم وجبة من حسابك";
    const fmt = (n: number) => `₪${Number(n || 0).toFixed(2)}`;
    const lines: string[] = [];
    if (order_number) lines.push(`فاتورة #${order_number}`);
    if (discount_label) lines.push(`النوع: ${discount_label}`);
    if (typeof full_amount === "number") lines.push(`الإجمالي: ${fmt(full_amount)}`);
    if (typeof employee_share_pct === "number") lines.push(`نسبتك: ${employee_share_pct}%`);
    lines.push(`المخصوم: ${fmt(deducted_amount)}`);
    if (items_summary) lines.push(String(items_summary).slice(0, 120));
    const messageBody = lines.join(" • ");

    // Fire push via push-send (service-role gated).
    const res = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: recipient,
        title,
        body: messageBody,
        path: "/portal",
      }),
    });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && (json.sent ?? 0) > 0;

    // Log delivery
    await admin.from("notification_log").insert({
      user_id: recipient,
      type: "employee_meal",
      channel: "push",
      title,
      body: messageBody,
      delivery_status: ok ? "delivered" : "failed",
      delivery_error: ok ? null : (json.note ?? json.error ?? `status ${res.status}`),
    });

    return new Response(JSON.stringify({ ok: true, sent: json.sent ?? 0, delivered: ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-employee-meal exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});