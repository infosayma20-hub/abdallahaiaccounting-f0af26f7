import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wheels-signature, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map Wheels statuses to our internal delivery_status values.
// Wheels typical lifecycle: pending → accepted/assigned → picked_up → delivered (or cancelled/failed).
function mapStatus(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (["accepted", "assigned", "captain_assigned", "driver_assigned"].includes(s)) return "accepted";
  if (["picked", "picked_up", "pickup", "on_the_way", "in_transit", "delivering"].includes(s)) return "picked_up";
  if (["delivered", "completed", "done", "received"].includes(s)) return "delivered";
  if (["cancelled", "canceled", "rejected", "failed"].includes(s)) return "cancelled";
  if (["pending", "new", "received_by_wheels"].includes(s)) return "dispatching";
  return s; // pass through unknown
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Shared-secret authentication (Wheels must include it as a header or ?token=)
  const expected = Deno.env.get("WHEELS_WEBHOOK_TOKEN");
  const got =
    req.headers.get("x-webhook-token") ||
    req.headers.get("x-wheels-signature") ||
    new URL(req.url).searchParams.get("token");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { /* keep empty */ }

  // Accept several shapes from Wheels.
  const data = payload?.data ?? payload;
  const orderRef = data?.orderId ?? data?.order_id ?? data?.reference ?? data?.external_id;
  const wheelsId = data?.id ?? data?.wheels_id ?? null;
  const statusRaw = data?.status ?? data?.event ?? data?.type;
  const captain = data?.captain ?? data?.driver ?? {};
  const captainName = captain?.name ?? data?.captain_name ?? data?.driver_name ?? null;
  const captainPhone = captain?.phone ?? data?.captain_phone ?? data?.driver_phone ?? null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Always log raw call for debugging.
  await admin.from("webhook_logs").insert({
    source: "wheels",
    endpoint: "wheels-webhook",
    payload,
    status_code: 200,
  }).then(() => {}, () => {});

  if (!orderRef) {
    return new Response(JSON.stringify({ ok: false, error: "missing orderId" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find the pos_order by order_number (what we sent as orderId) or by id.
  const { data: orders } = await admin
    .from("pos_orders")
    .select("id, wheels_response, delivery_status")
    .or(`order_number.eq.${orderRef},id.eq.${orderRef}`)
    .limit(1);

  const order = orders?.[0];
  if (!order) {
    return new Response(JSON.stringify({ ok: false, error: "order not found", orderRef }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mapped = mapStatus(statusRaw);
  const prevResponse = (order.wheels_response as any) || {};
  const events = Array.isArray(prevResponse.events) ? prevResponse.events : [];
  events.push({
    at: new Date().toISOString(),
    status: statusRaw ?? null,
    mapped,
    captain: captainName || captainPhone ? { name: captainName, phone: captainPhone } : undefined,
    wheels_id: wheelsId,
  });

  const update: Record<string, unknown> = {
    wheels_response: { ...prevResponse, events, last_status: statusRaw ?? null, wheels_id: wheelsId ?? prevResponse.wheels_id },
  };
  if (mapped) update.delivery_status = mapped;

  await admin.from("pos_orders").update(update).eq("id", order.id);

  return new Response(JSON.stringify({ ok: true, order_id: order.id, mapped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});