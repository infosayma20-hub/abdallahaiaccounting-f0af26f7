import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WHEELS_BASE = Deno.env.get("WHEELS_BASE_URL") || "https://apis.wheels.delivery";

// Read-only / non-destructive connectivity test for Wheels integration.
// Modes:
//   - "ping":     validates secret + branch by calling getDeliveryPrice for the
//                 branch's first mapped area. Does NOT create a Wheels order.
//   - "resolve":  parses an arbitrary address string and returns the matched
//                 delivery zone + wheels_area_id + price.
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
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({})) as {
      mode?: "ping" | "resolve";
      branch_id?: string;
      address?: string;
    };
    const mode = body.mode ?? "ping";

    if (mode === "resolve") {
      const branchId = body.branch_id;
      const address = (body.address ?? "").trim();
      if (!branchId || !address) {
        return new Response(JSON.stringify({ error: "branch_id و address مطلوبان" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parts = address.split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
      // Candidates ordered from most-specific to least-specific:
      //   1) the exact last segment ("الطيرة")               ← what send-to-wheels does today
      //   2) the last two segments joined ("الجدول - الطيرة") ← catches multi-dash zone names
      //   3) the full string                                   ← single-segment addresses
      const candidates: string[] = [];
      if (parts.length >= 1) candidates.push(parts[parts.length - 1]);
      if (parts.length >= 2) candidates.push(parts.slice(-2).join(" - "));
      candidates.push(address);
      const unique = Array.from(new Set(candidates));

      const attempts: Array<{ candidate: string; match_type: "exact" | "ilike" | null; zone: any }> = [];
      let matched: any = null;
      let matchedCandidate: string | null = null;
      let matchType: "exact" | "ilike" | null = null;

      for (const c of unique) {
        const { data: exact } = await admin
          .from("delivery_zones")
          .select("area_name, wheels_area_id, wheels_fixed_price")
          .eq("user_id", userId)
          .eq("branch_id", branchId)
          .eq("area_name", c)
          .maybeSingle();
        if (exact?.wheels_area_id) {
          attempts.push({ candidate: c, match_type: "exact", zone: exact });
          matched = exact; matchedCandidate = c; matchType = "exact"; break;
        }
        const { data: like } = await admin
          .from("delivery_zones")
          .select("area_name, wheels_area_id, wheels_fixed_price")
          .eq("user_id", userId)
          .eq("branch_id", branchId)
          .ilike("area_name", c)
          .not("wheels_area_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (like?.wheels_area_id) {
          attempts.push({ candidate: c, match_type: "ilike", zone: like });
          matched = like; matchedCandidate = c; matchType = "ilike"; break;
        }
        attempts.push({ candidate: c, match_type: null, zone: null });
      }

      // What send-to-wheels would actually pick today (last segment only).
      const productionCandidate = parts.length >= 2 ? parts[parts.length - 1] : (parts[0] ?? "");
      const productionWouldMatch = matched && matchedCandidate === productionCandidate;

      return new Response(JSON.stringify({
        success: !!matched?.wheels_area_id,
        extracted_area: productionCandidate,
        matched_candidate: matchedCandidate,
        match_type: matchType,
        matched_zone: matched ?? null,
        attempts,
        production_would_match: productionWouldMatch,
        warning: matched && !productionWouldMatch
          ? "تطابق فقط عبر دمج أكثر من segment. send-to-wheels الحالي بياخد آخر segment فقط، فالطلب الفعلي رح يفشل بهذا العنوان."
          : null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // mode === "ping"
    const branchId = body.branch_id;
    if (!branchId) {
      return new Response(JSON.stringify({ error: "branch_id مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cfg } = await admin
      .from("wheels_branch_config")
      .select("wheels_branch_id, secret_name, is_active")
      .eq("user_id", userId)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!cfg) {
      return new Response(JSON.stringify({ success: false, error: "الفرع غير مربوط بـ Wheels" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!cfg.is_active) {
      return new Response(JSON.stringify({ success: false, error: "الربط غير مفعّل لهذا الفرع" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get(cfg.secret_name);
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: `المفتاح ${cfg.secret_name} غير موجود في الأسرار` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick any mapped area for this branch as a probe
    const { data: probeZone } = await admin
      .from("delivery_zones")
      .select("area_name, wheels_area_id, wheels_fixed_price")
      .eq("user_id", userId)
      .eq("branch_id", branchId)
      .not("wheels_area_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (!probeZone?.wheels_area_id) {
      return new Response(JSON.stringify({
        success: false,
        error: "لا توجد مناطق مربوطة بـ Wheels لهذا الفرع",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const started = Date.now();
    let httpStatus = 0;
    let respJson: any = null;
    let networkErr: string | null = null;
    try {
      const r = await fetch(`${WHEELS_BASE}/orders/getDeliveryPrice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({ branch: cfg.wheels_branch_id, area: probeZone.wheels_area_id }),
      });
      httpStatus = r.status;
      try { respJson = await r.json(); } catch { respJson = null; }
    } catch (e) {
      networkErr = e instanceof Error ? e.message : String(e);
    }
    const latencyMs = Date.now() - started;

    const ok = !networkErr && httpStatus >= 200 && httpStatus < 300 && !respJson?.error;

    return new Response(JSON.stringify({
      success: ok,
      latency_ms: latencyMs,
      http_status: httpStatus,
      wheels_branch_id: cfg.wheels_branch_id,
      secret_name: cfg.secret_name,
      probe_area: probeZone,
      wheels_response: respJson,
      network_error: networkErr,
      error: ok ? null : (respJson?.error || respJson?.message || networkErr || `HTTP ${httpStatus}`),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("wheels-test error:", err);
    return new Response(JSON.stringify({ error: "خطأ داخلي" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});