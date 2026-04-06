import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

/**
 * sync-production-amwali
 * Logs every status change from Amwali into webhook_logs
 * and can optionally forward to an external endpoint (Qamar Brand).
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
      event_type,        // e.g. "status_change", "sub_stage_complete", "production_update"
      from_status,
      to_status,
      sub_stage,
      changed_by_name,
      changed_by_role,
      metadata,          // any extra data (worker, duration, notes)
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

    // Try to forward to external Qamar Brand endpoint if configured
    let externalSuccess = true;
    let externalStatus = null;
    let externalBody = null;
    let errorMessage = null;

    const externalUrl = Deno.env.get("QAMAR_WEBHOOK_URL");
    if (externalUrl) {
      try {
        const extRes = await fetch(externalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Webhook-Secret": Deno.env.get("QAMAR_WEBHOOK_SECRET") || "" },
          body: JSON.stringify(payload),
        });
        externalStatus = extRes.status;
        externalBody = await extRes.text();
        externalSuccess = extRes.ok;
        if (!extRes.ok) {
          errorMessage = `External endpoint returned ${extRes.status}: ${externalBody.substring(0, 500)}`;
        }
      } catch (err: any) {
        externalSuccess = false;
        errorMessage = `External call failed: ${err.message}`;
      }
    }

    const durationMs = Date.now() - startTime;

    // Log to webhook_logs
    await supabaseAdmin.from("webhook_logs").insert({
      user_id,
      order_id,
      order_reference: order_reference || null,
      direction: "outgoing",
      endpoint: externalUrl || "internal_only",
      event_type,
      payload,
      response_status: externalStatus,
      response_body: externalBody?.substring(0, 2000) || null,
      success: externalSuccess,
      error_message: errorMessage,
      duration_ms: durationMs,
    });

    return new Response(JSON.stringify({
      success: true,
      logged: true,
      external_synced: externalUrl ? externalSuccess : null,
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
