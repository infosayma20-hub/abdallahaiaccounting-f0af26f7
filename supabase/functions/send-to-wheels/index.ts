import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WHEELS_BASE = Deno.env.get("WHEELS_BASE_URL") || "https://apis.wheels.delivery";

const ERROR_AR: Record<string, string> = {
  key_not_found: "مفتاح Wheels غير صحيح أو غير موجود",
  branch_id_mismatched: "مفتاح Wheels لا يطابق الفرع",
  area_id_mismatched: "المنطقة لا تطابق الفرع",
  branch_not_found: "الفرع غير موجود في Wheels",
  area_not_exist: "المنطقة غير موجودة في Wheels",
  internal_server_error: "خطأ داخلي من Wheels",
};

function translate(err: unknown): string {
  if (!err) return "خطأ غير معروف من Wheels";
  const s = typeof err === "string" ? err : (err as any)?.message || (err as any)?.error || JSON.stringify(err);
  for (const k of Object.keys(ERROR_AR)) if (s.toLowerCase().includes(k)) return ERROR_AR[k];
  return s.length > 240 ? s.slice(0, 240) : s;
}

async function jsonOf(resp: Response) {
  try { return await resp.json(); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const order_id = (body as any)?.order_id;
    if (!order_id || typeof order_id !== "string") {
      return new Response(JSON.stringify({ error: "order_id مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for cross-table reads and updates
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Fetch order (via user RLS to enforce ownership)
    const { data: order, error: orderErr } = await userClient
      .from("pos_orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "الطلب غير موجود" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.is_delivery) {
      return new Response(JSON.stringify({ error: "هذا الطلب ليس للتوصيل" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!order.warehouse_id) {
      return new Response(JSON.stringify({ error: "الطلب بدون مستودع/فرع" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve branch_id: prefer session → terminal → branch (POS canonical path);
    // fall back to warehouse.branch_id when session is missing (legacy orders).
    let branchId: string | null = null;
    if (order.session_id) {
      const { data: sess } = await admin
        .from("pos_sessions")
        .select("terminal_id")
        .eq("id", order.session_id)
        .maybeSingle();
      const terminalId = (sess as any)?.terminal_id;
      if (terminalId) {
        const { data: term } = await admin
          .from("pos_terminals")
          .select("branch_id")
          .eq("id", terminalId)
          .maybeSingle();
        branchId = (term as any)?.branch_id ?? null;
      }
    }
    if (!branchId && order.warehouse_id) {
      const { data: wh } = await admin
        .from("warehouses")
        .select("branch_id")
        .eq("id", order.warehouse_id)
        .maybeSingle();
      branchId = (wh as any)?.branch_id ?? null;
    }
    if (!branchId) {
      return new Response(JSON.stringify({ error: "تعذر تحديد فرع الطلب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.customer_name || !order.customer_phone || !order.customer_address) {
      return new Response(JSON.stringify({ error: "بيانات العميل غير مكتملة (الاسم/الهاتف/العنوان)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.wheels_request_status === "sent") {
      return new Response(JSON.stringify({ error: "تم إرسال هذا الطلب مسبقاً إلى Wheels" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Branch config
    const { data: cfg } = await admin
      .from("wheels_branch_config")
      .select("wheels_branch_id, secret_name, is_active")
      .eq("user_id", order.user_id)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!cfg || !cfg.is_active) {
      return new Response(JSON.stringify({ error: "هذا الفرع غير مربوط بـ Wheels" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get(cfg.secret_name);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: `مفتاح ${cfg.secret_name} غير موجود في الأسرار` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Area lookup — order.area_name first; if empty, parse customer_address
    //    (format: "<city> - <area>"); fall back to delivery_address.
    function extractArea(addr: string | null | undefined): string {
      if (!addr) return "";
      const parts = addr.split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
      return parts.length >= 2 ? parts[parts.length - 1] : (parts[0] ?? "");
    }
    const areaName =
      (order.area_name && String(order.area_name).trim()) ||
      extractArea(order.customer_address) ||
      extractArea(order.delivery_address);

    if (!areaName) {
      return new Response(JSON.stringify({ error: "المنطقة غير محددة على الطلب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try exact match first, then case-insensitive ILIKE
    let { data: zone } = await admin
      .from("delivery_zones")
      .select("wheels_area_id, wheels_fixed_price")
      .eq("user_id", order.user_id)
      .eq("branch_id", branchId)
      .eq("area_name", areaName)
      .maybeSingle();

    if (!zone?.wheels_area_id) {
      const { data: zone2 } = await admin
        .from("delivery_zones")
        .select("wheels_area_id, wheels_fixed_price")
        .eq("user_id", order.user_id)
        .eq("branch_id", branchId)
        .ilike("area_name", areaName)
        .not("wheels_area_id", "is", null)
        .limit(1)
        .maybeSingle();
      zone = zone2 as any;
    }

    if (!zone?.wheels_area_id) {
      return new Response(JSON.stringify({ error: `المنطقة "${areaName}" غير مربوطة بمعرف Wheels لهذا الفرع` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Mark sending
    await admin.from("pos_orders").update({
      wheels_request_status: "sending",
      wheels_last_error: null,
    }).eq("id", order_id);

    const headers = { "Content-Type": "application/json", "api-key": apiKey };

    // 5) Get delivery price (best-effort)
    let priceVal: number | null = zone.wheels_fixed_price ?? null;
    let priceResp: any = null;
    try {
      const r = await fetch(`${WHEELS_BASE}/orders/getDeliveryPrice`, {
        method: "POST", headers,
        body: JSON.stringify({ branch: cfg.wheels_branch_id, area: zone.wheels_area_id }),
      });
      priceResp = await jsonOf(r);
      if (r.ok) {
        const p = priceResp?.price ?? priceResp?.data?.price ?? priceResp?.delivery_price;
        if (typeof p === "number") priceVal = p;
      }
    } catch (_) { /* non-fatal */ }

    // 6) Send order
    const payload = {
      orderId: String(order.order_number || order.id),
      cname: order.customer_name,
      cphone: order.customer_phone,
      caddress: order.customer_address,
      branch: cfg.wheels_branch_id,
      area: zone.wheels_area_id,
    };
    const addResp = await fetch(`${WHEELS_BASE}/orders/add`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    const addJson: any = await jsonOf(addResp);
    const ok = addResp.ok && (addJson?.success === true || addJson?.success === undefined && addResp.status < 300 && !addJson?.error);

    if (ok) {
      await admin.from("pos_orders").update({
        wheels_request_status: "sent",
        wheels_sent_at: new Date().toISOString(),
        wheels_response: { add: addJson, price: priceResp },
        wheels_delivery_price: priceVal,
        wheels_last_error: null,
        delivery_status: order.delivery_status && order.delivery_status !== "none" ? order.delivery_status : "dispatching",
      }).eq("id", order_id);

      return new Response(JSON.stringify({
        success: true,
        status: "sent",
        wheels_delivery_price: priceVal,
        payload,
        wheels_response: addJson,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const errMsg = translate(addJson?.error || addJson?.message || addJson);
    await admin.from("pos_orders").update({
      wheels_request_status: "failed",
      wheels_last_error: errMsg,
      wheels_response: { add: addJson, price: priceResp },
    }).eq("id", order_id);

    return new Response(JSON.stringify({
      success: false, status: "failed", error: errMsg, wheels_response: addJson,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("send-to-wheels error:", err);
    return new Response(JSON.stringify({ error: "خطأ داخلي في الخادم" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});