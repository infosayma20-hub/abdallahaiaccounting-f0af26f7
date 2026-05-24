import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const parseRequestBody = async (req: Request): Promise<Record<string, unknown>> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return {};

  const contentType = req.headers.get("content-type")?.toLowerCase() || "";

  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody).entries());
  }

  const parsedJson = parseMaybeJson(rawBody);
  if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
    return parsedJson as Record<string, unknown>;
  }

  const params = new URLSearchParams(rawBody);
  if ([...params.keys()].length > 0) {
    return Object.fromEntries(params.entries());
  }

  return { raw: rawBody };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Shared-secret authentication ──
  const expectedSecret = Deno.env.get("PBX_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-pbx-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (!provided || provided !== expectedSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  } else {
    console.warn("PBX webhook: PBX_WEBHOOK_SECRET not configured — rejecting request");
    return jsonResponse({ error: "Webhook secret not configured" }, 503);
  }

  try {
    const body = await parseRequestBody(req);
    console.log("PBX webhook received:", JSON.stringify(body));

    let callerNumber: string | null = null;
    let calledNumber: string | null = null;
    let callId: string | null = null;
    let trunkName: string | null = null;

    const directMsg = parseMaybeJson(body.msg);
    const dataPayload = body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : null;
    const nestedMsg = dataPayload ? parseMaybeJson(dataPayload.msg ?? dataPayload) : null;
    const msg = (directMsg && typeof directMsg === "object" ? directMsg : null) ||
      (nestedMsg && typeof nestedMsg === "object" ? nestedMsg : null) ||
      body;

    const msgRecord = msg as Record<string, any>;
    const inbound = msgRecord?.members?.[0]?.inbound;

    if (inbound) {
      callerNumber = inbound.from ?? null;
      calledNumber = inbound.to ?? null;
      callId = msgRecord.call_id ?? null;
      trunkName = inbound.trunk_name ?? null;
    } else if (body.caller_number || body.from) {
      callerNumber = String(body.caller_number || body.from);
      calledNumber = body.called_number || body.to ? String(body.called_number || body.to) : null;
      callId = body.call_id ? String(body.call_id) : null;
      trunkName = body.trunk_name ? String(body.trunk_name) : null;
    }

    if (!callerNumber) {
      return jsonResponse({ error: "No caller number found" }, 400);
    }

    const normalizedNumber = callerNumber
      .replace(/[\s\-()]/g, "")
      .replace(/^(\+|00)(972|970)/, "0");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Determine target company/user ──
    // Default owner for PBX: شركة مطاعم الدجاج الملكي (malaky broast)
    const DEFAULT_PBX_OWNER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";
    const companyOwnerId = DEFAULT_PBX_OWNER_ID;

    const phoneVariants = Array.from(new Set([
      normalizedNumber,
      normalizedNumber.replace(/^0/, ""),
      `+972${normalizedNumber.replace(/^0/, "")}`,
      `+970${normalizedNumber.replace(/^0/, "")}`,
      callerNumber,
    ].filter(Boolean)));

    // Search for customer within this company's data
    const { data: customers } = await supabase
      .from("pos_customers")
      .select("id, name, phone, address, user_id")
      .or(phoneVariants.map((phone) => `phone.eq.${phone}`).join(","))
      .eq("user_id", companyOwnerId)
      .limit(1);

    const customer = customers?.[0] || null;

    // Always use the company owner as the target user
    const userId = companyOwnerId;

    if (!userId) {
      return jsonResponse({ error: "Cannot determine user context" }, 400);
    }

    const { data: callEvent, error } = await supabase
      .from("pbx_call_events")
      .insert({
        user_id: userId,
        caller_number: callerNumber,
        called_number: calledNumber,
        call_id: callId,
        trunk_name: trunkName,
        customer_id: customer?.id || null,
        customer_name: customer?.name || null,
        customer_phone: customer?.phone || callerNumber,
        customer_address: customer?.address || null,
        status: "ringing",
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return jsonResponse({ error: error.message }, 500);
    }

    console.log("Call event created:", callEvent.id, "User:", userId, "Customer:", customer?.name || "unknown");

    return jsonResponse({
      success: true,
      call_id: callEvent.id,
      customer_found: !!customer,
      customer_name: customer?.name || null,
    });
  } catch (err) {
    console.error("PBX webhook error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
