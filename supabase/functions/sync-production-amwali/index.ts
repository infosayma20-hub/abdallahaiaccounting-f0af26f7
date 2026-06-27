import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

/**
 * sync-production-amwali
 * Logs every status/production change into webhook_logs (internal only).
 * External Qamar webhook integration removed.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const {
      user_id,
      order_id,
      order_reference,
      event_type,
      from_status,
      to_status,
      sub_stage,
      changed_by_name,
      changed_by_role,
      metadata,
    } = body;

    if (!user_id || !order_id || !event_type) {
      return new Response(JSON.stringify({ error: "Missing required fields: user_id, order_id, event_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Build payload ──
    const payload = {
      event_type,
      order_id,
      order_reference: order_reference || null,
      from_status: from_status || null,
      to_status: to_status || null,
      sub_stage: sub_stage || null,
      changed_by_name: changed_by_name || null,
      changed_by_role: changed_by_role || null,
      metadata: metadata || {},
      synced_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;

    // ── Log to webhook_logs ──
    await supabaseAdmin.from("webhook_logs").insert({
      user_id,
      order_id,
      order_reference: order_reference || null,
      direction: "outgoing",
      endpoint: "internal_only",
      event_type,
      payload,
      response_status: null,
      response_body: null,
      success: true,
      error_message: null,
      duration_ms: durationMs,
    });

    return new Response(JSON.stringify({
      success: true,
      logged: true,
      external_synced: null,
      duration_ms: durationMs,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return new Response(JSON.stringify({ error: err.message, duration_ms: durationMs }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
