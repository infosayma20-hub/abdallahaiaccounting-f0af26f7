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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internalServiceKey = Deno.env.get("AMWALI_SERVICE_ROLE_KEY") || serviceRoleKey;
    const token = authHeader.replace("Bearer ", "");
    const isServiceRoleCall = token === serviceRoleKey || token === internalServiceKey;

    // Service role client for cross-table reads and updates. This function may
    // be called either by the cashier's browser or by a DB trigger after a paid
    // delivery order, so the background path uses this client intentionally.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = isServiceRoleCall
      ? { data: { claims: { role: "service_role" } }, error: null } as any
      : await userClient.auth.getClaims(token);
    if (!isServiceRoleCall && (claimsError || !claimsData?.claims)) {
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

    // 1) Fetch order. Browser calls use user RLS; DB-trigger calls use service
    // role because there is no interactive user token in the database worker.
    const orderClient = isServiceRoleCall ? admin : userClient;
    const { data: order, error: orderErr } = await orderClient
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

    // pos_orders has no customer_phone column. For call-center orders the phone
    // lives on the linked call_center_orders row; fall back to that, then to
    // any "جوال: <number>" tag embedded in order_note as a last resort.
    let customerPhone: string | null = (order as any).customer_phone ?? null;
    // Skip-flag: when the agent marked the call-center order as "already on
    // Wheels" (typical for orders that originally came from the Wheels app),
    // we must NOT re-dispatch — that would create a duplicate trip. The
    // lookup is unconditional so even orders that already had a phone on
    // pos_orders are still gated by the linked call-center row.
    let skipWheelsDispatch = false;
    if (!customerPhone) {
      const { data: cco } = await admin
        .from("call_center_orders")
        .select("customer_phone, delivery_info, skip_wheels_dispatch")
        .eq("pos_order_id", order_id)
        .maybeSingle();
      customerPhone = (cco as any)?.customer_phone
        || (cco as any)?.delivery_info?.caller_phone
        || null;
      skipWheelsDispatch = !!(cco as any)?.skip_wheels_dispatch;
    } else {
      const { data: cco2 } = await admin
        .from("call_center_orders")
        .select("skip_wheels_dispatch")
        .eq("pos_order_id", order_id)
        .maybeSingle();
      skipWheelsDispatch = !!(cco2 as any)?.skip_wheels_dispatch;
    }

    if (skipWheelsDispatch) {
      // Mark on pos_orders so reports / UI know this was intentionally
      // skipped, then return a silent skip. Frontend toast handler treats
      // this message as non-actionable.
      await admin.from("pos_orders").update({
        wheels_request_status: "skipped",
        wheels_last_error: null,
      } as any).eq("id", order_id);
      return new Response(JSON.stringify({
        success: false,
        skipped: true,
        error: "تم تجاهل الإرسال — الطلبية مسجّلة أصلاً على Wheels",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customerPhone && typeof order.order_note === "string") {
      const m = order.order_note.match(/جوال[:：]\s*([0-9+\-\s]{6,})/);
      if (m) customerPhone = m[1].trim();
    }
    if (!order.customer_name || !customerPhone || !order.customer_address) {
      return new Response(JSON.stringify({ error: "بيانات العميل غير مكتملة (الاسم/الهاتف/العنوان)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.wheels_request_status === "sent") {
      return new Response(JSON.stringify({ error: "تم إرسال هذا الطلب مسبقاً إلى Wheels" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.wheels_request_status === "sending") {
      return new Response(JSON.stringify({ error: "جاري إرسال هذا الطلب إلى Wheels" }), {
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

    // 3) Area lookup — try order.area_name first, then a series of candidates
    //    derived from customer_address / delivery_address, ordered from most
    //    specific (last segment) to least specific (full address). This handles
    //    multi-dash addresses like "رام الله - الجدول - الطيرة" where the DB
    //    zone may be stored as "الجدول - الطيرة".
    function buildCandidates(addr: string | null | undefined): string[] {
      if (!addr) return [];
      const parts = addr.split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return [];
      const out: string[] = [];
      out.push(parts[parts.length - 1]);
      if (parts.length >= 2) out.push(parts.slice(-2).join(" - "));
      out.push(addr.trim());
      return Array.from(new Set(out.filter(Boolean)));
    }

    const candidates: string[] = [];
    const seedArea = order.area_name && String(order.area_name).trim();
    if (seedArea) candidates.push(seedArea);
    for (const c of buildCandidates(order.customer_address)) if (!candidates.includes(c)) candidates.push(c);
    for (const c of buildCandidates(order.delivery_address)) if (!candidates.includes(c)) candidates.push(c);

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "المنطقة غير محددة على الطلب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let zone: { wheels_area_id: number | null; wheels_fixed_price: number | null } | null = null;
    let matchedArea: string | null = null;
    let matchedVia: string | null = null;

    // Pass 0 — pre-resolved area from call_center_orders.delivery_info.
    // The Call-Center DeliveryZonePicker writes { area, branch_id, ... } into
    // delivery_info; trusting it short-circuits all address parsing. Scoped to
    // the SAME branch we resolved above so a wrong delivery_info row can't
    // misroute orders to a different branch's zone.
    try {
      const { data: ccoPre } = await admin
        .from("call_center_orders")
        .select("delivery_info")
        .eq("pos_order_id", order_id)
        .maybeSingle();
      const di: any = (ccoPre as any)?.delivery_info || null;
      const preArea = di && typeof di.area === "string" ? di.area.trim() : null;
      const preBranch = di && typeof di.branch_id === "string" ? di.branch_id : null;
      if (preArea && preBranch && preBranch === branchId) {
        const { data: zPre } = await admin
          .from("delivery_zones")
          .select("wheels_area_id, wheels_fixed_price, area_name")
          .eq("user_id", order.user_id)
          .eq("branch_id", branchId)
          .eq("area_name", preArea)
          .not("wheels_area_id", "is", null)
          .maybeSingle();
        if (zPre?.wheels_area_id) {
          zone = zPre as any;
          matchedArea = (zPre as any).area_name || preArea;
          matchedVia = "delivery_info";
        }
      }
    } catch (_) { /* non-fatal — fall through to address parsing */ }

    // Normalize for fuzzy comparison:
    //  - strip leading definite article "ال"
    //  - drop digits / phone-like tokens
    //  - collapse whitespace and punctuation
    function normalize(s: string): string {
      return String(s || "")
        .replace(/[\u064B-\u0652\u0670]/g, "")   // strip Arabic diacritics
        .replace(/\d+/g, " ")                     // drop digits
        .replace(/[()،,./|\\]/g, " ")            // common punctuation
        .replace(/\s+/g, " ")
        .trim();
    }
    function stripAl(s: string): string {
      const n = normalize(s);
      return n.startsWith("ال") ? n.slice(2).trim() : n;
    }
    function escapeLike(s: string): string {
      return s.replace(/[%_\\]/g, (m) => `\\${m}`);
    }

    // Pass 1 — original exact + ILIKE per candidate (unchanged behavior).
    if (!zone?.wheels_area_id) for (const cand of candidates) {
      const { data: z1 } = await admin
        .from("delivery_zones")
        .select("wheels_area_id, wheels_fixed_price")
        .eq("user_id", order.user_id)
        .eq("branch_id", branchId)
        .eq("area_name", cand)
        .not("wheels_area_id", "is", null)
        .maybeSingle();
      if (z1?.wheels_area_id) { zone = z1 as any; matchedArea = cand; matchedVia = "exact"; break; }

      const { data: z2 } = await admin
        .from("delivery_zones")
        .select("wheels_area_id, wheels_fixed_price")
        .eq("user_id", order.user_id)
        .eq("branch_id", branchId)
        .ilike("area_name", cand)
        .not("wheels_area_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (z2?.wheels_area_id) { zone = z2 as any; matchedArea = cand; matchedVia = "ilike_exact"; break; }
    }

    // Pass 2 — alias exact match against the new area_aliases column.
    if (!zone?.wheels_area_id) {
      for (const cand of candidates) {
        const norm = normalize(cand);
        const variants = Array.from(new Set([cand, norm, stripAl(cand)].filter((v) => v && v.length > 1)));
        if (variants.length === 0) continue;
        const { data: z } = await admin
          .from("delivery_zones")
          .select("wheels_area_id, wheels_fixed_price, area_name")
          .eq("user_id", order.user_id)
          .eq("branch_id", branchId)
          .overlaps("area_aliases", variants)
          .not("wheels_area_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (z?.wheels_area_id) { zone = z as any; matchedArea = cand; matchedVia = "alias"; break; }
      }
    }

    // Pass 3 — normalized ILIKE: try matching with "ال" stripped + substring
    // search in both directions. Only kicks in if nothing matched above; the
    // length guard (>= 3 chars) prevents tiny tokens from matching too broadly.
    if (!zone?.wheels_area_id) {
      for (const cand of candidates) {
        const norm = normalize(cand);
        const noAl = stripAl(cand);
        const probes = Array.from(new Set([norm, noAl].filter((v) => v && v.length >= 3)));
        for (const p of probes) {
          const pattern = `%${escapeLike(p)}%`;
          const { data: z } = await admin
            .from("delivery_zones")
            .select("wheels_area_id, wheels_fixed_price, area_name")
            .eq("user_id", order.user_id)
            .eq("branch_id", branchId)
            .ilike("area_name", pattern)
            .not("wheels_area_id", "is", null)
            .limit(1)
            .maybeSingle();
          if (z?.wheels_area_id) { zone = z as any; matchedArea = (z as any).area_name || cand; matchedVia = "substring"; break; }
        }
        if (zone?.wheels_area_id) break;
      }
    }

    // Pass 4 — pg_trgm similarity (≥ 0.4). Catches typos / diacritics / minor
    // misspellings ("الإنجيلي" vs "الانجيلي", "رفيدية" vs "رفيديا"). Scoped
    // to the SAME branch, so no cross-branch leakage is possible.
    if (!zone?.wheels_area_id) {
      for (const cand of candidates) {
        const probe = normalize(cand);
        if (!probe || probe.length < 3) continue;
        const { data: fz } = await admin.rpc("match_wheels_zone_fuzzy", {
          p_user_id: order.user_id,
          p_branch_id: branchId,
          p_candidate: probe,
          p_threshold: 0.4,
        });
        const hit = Array.isArray(fz) ? fz[0] : (fz as any);
        if (hit?.wheels_area_id) {
          zone = { wheels_area_id: hit.wheels_area_id, wheels_fixed_price: hit.wheels_fixed_price } as any;
          matchedArea = hit.area_name || cand;
          matchedVia = `fuzzy:${typeof hit.score === "number" ? hit.score.toFixed(2) : ""}`;
          break;
        }
      }
    }

    if (!zone?.wheels_area_id) {
      // Log unmatched attempt for proactive alias seeding. Best-effort.
      try {
        await admin.from("wheels_unmatched_areas").insert({
          user_id: order.user_id,
          branch_id: branchId,
          order_id: order_id,
          customer_address: order.customer_address || null,
          candidates,
        } as any);
      } catch (_) { /* non-fatal */ }
      return new Response(JSON.stringify({
        error: `لم نجد منطقة مطابقة في Wheels. جرّبنا: ${candidates.map((c) => `"${c}"`).join(" / ")}`,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Atomically claim the order before calling Wheels. This prevents a
    // duplicate courier request when the browser call and DB-trigger retry fire
    // at the same time.
    const currentStatus = order.wheels_request_status || "not_sent";
    const { data: claimedOrder } = await admin.from("pos_orders").update({
      wheels_request_status: "sending",
      wheels_last_error: null,
    }).eq("id", order_id)
      .eq("wheels_request_status", currentStatus)
      .select("id")
      .maybeSingle();

    if (!claimedOrder) {
      return new Response(JSON.stringify({ error: "جاري إرسال هذا الطلب إلى Wheels" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      cphone: customerPhone,
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
        wheels_response: { add: addJson, price: priceResp, matched_area: matchedArea, matched_via: matchedVia },
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