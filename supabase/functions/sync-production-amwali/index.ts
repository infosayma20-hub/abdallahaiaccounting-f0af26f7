import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

/**
 * sync-production-amwali
 * 1. Logs every status/production change into webhook_logs
 * 2. Sends webhook to Qamar Brand with Arabic→English status mapping
 */

// Arabic (Amwali) → English (Qamar) status map
const statusMapToEnglish: Record<string, string> = {
  "مسودة": "draft",
  "جديد": "new",
  "قيد المراجعة": "reviewing",
  "مؤكد": "confirmed",
  "قيد التصنيع": "in_production",
  "جاهز للفحص": "inspection",
  "جاهز للتسليم": "ready_delivery",
  "قيد التوصيل": "delivering",
  "تم التسليم": "delivered",
  "مفوتر": "invoiced",
  "ملغي": "cancelled",
  "مؤجل": "postponed",
};

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

    // ── Send webhook to Qamar Brand ──
    let externalSuccess = true;
    let externalStatus = null;
    let externalBody = null;
    let errorMessage = null;

    const QAMAR_URL = Deno.env.get("QAMAR_SUPABASE_URL");
    const SHARED_SECRET = Deno.env.get("QAMAR_SHARED_SECRET");

    if (QAMAR_URL && order_reference?.startsWith("QM-")) {
      try {
        // Build Qamar-formatted webhook payload
        const qamarPayload: Record<string, unknown> = {
          secret: SHARED_SECRET || "",
          event_type,
          reference_number: order_reference,
          timestamp: new Date().toISOString(),
        };

        if (event_type === "status_change") {
          qamarPayload.from_status = from_status || null;
          qamarPayload.to_status = to_status || null;
          // Also send English-mapped statuses for Qamar
          qamarPayload.from_status_en = from_status ? (statusMapToEnglish[from_status] || from_status) : null;
          qamarPayload.to_status_en = to_status ? (statusMapToEnglish[to_status] || to_status) : null;
          qamarPayload.changed_by_name = changed_by_name || null;
          qamarPayload.metadata = metadata || {};
        } else if (event_type === "production_stage_complete") {
          qamarPayload.production_data = {
            current_stage: sub_stage || null,
            status: "completed",
            total_cost: metadata?.cost || 0,
            cost_details: metadata?.cost_details || {},
            completed_at: new Date().toISOString(),
            worker_name: metadata?.worker_name || changed_by_name || null,
            department: metadata?.department || sub_stage || null,
          };
        } else if (event_type === "payment_update") {
          qamarPayload.metadata = {
            amount_paid: metadata?.amount_paid || 0,
            payment_status: metadata?.payment_status || "partial",
          };
        }

        const webhookUrl = `${QAMAR_URL}/functions/v1/receive-amwali-webhook`;
        const extRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(qamarPayload),
        });

        externalStatus = extRes.status;
        externalBody = await extRes.text();
        externalSuccess = extRes.ok;
        if (!extRes.ok) {
          errorMessage = `Qamar webhook returned ${extRes.status}: ${externalBody.substring(0, 500)}`;
        }
      } catch (err: any) {
        externalSuccess = false;
        errorMessage = `Qamar webhook failed: ${err.message}`;
      }
    } else {
      // No Qamar URL or not a QM order — internal logging only
      externalSuccess = true;
    }

    const durationMs = Date.now() - startTime;

    // ── Log to webhook_logs ──
    await supabaseAdmin.from("webhook_logs").insert({
      user_id,
      order_id,
      order_reference: order_reference || null,
      direction: "outgoing",
      endpoint: QAMAR_URL ? `${QAMAR_URL}/functions/v1/receive-amwali-webhook` : "internal_only",
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
      external_synced: QAMAR_URL ? externalSuccess : null,
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
