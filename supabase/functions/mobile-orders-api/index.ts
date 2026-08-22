// mobile-orders-api
// Public API for external customer apps (e.g. Malaky mobile app).
// - POST /orders            → push a customer order into the POS "pending orders" screen (API-key auth)
// - GET  /orders/:ref       → poll order status by client_reference_id (API-key auth)
// - GET  /branches          → list active branches (API-key auth) — so the app can offer branch selection
// - GET    /admin/keys      → list own API keys (user JWT)
// - POST   /admin/keys      → generate a new API key, raw key returned ONCE (user JWT)
// - DELETE /admin/keys/:id  → revoke a key (user JWT)

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- helpers ----------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `umo_live_${hex}`;
}

/** Resolve the tenant owner from an x-api-key header. Returns null when invalid. */
async function resolveApiKey(req: Request): Promise<{ ownerId: string; keyId: string } | null> {
  const raw = req.headers.get("x-api-key") || "";
  if (!raw || raw.length < 16 || raw.length > 128) return null;
  const hash = await sha256Hex(raw);
  const { data } = await admin
    .from("external_api_keys")
    .select("id, user_id")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  // best-effort usage stamp
  admin.from("external_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { ownerId: data.user_id as string, keyId: data.id as string };
}

/** Resolve the signed-in dashboard user (for key management endpoints). */
async function resolveUser(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function logWebhook(entry: {
  ownerId: string;
  eventType: string;
  endpoint: string;
  payload: unknown;
  status: number;
  response: unknown;
  success: boolean;
  orderId?: string | null;
  reference?: string | null;
  durationMs: number;
  error?: string | null;
}) {
  try {
    await admin.from("webhook_logs").insert({
      user_id: entry.ownerId,
      direction: "in",
      event_type: entry.eventType,
      endpoint: entry.endpoint,
      payload: (entry.payload ?? null) as any,
      response_status: entry.status,
      response_body: typeof entry.response === "string" ? entry.response : JSON.stringify(entry.response),
      success: entry.success,
      order_id: entry.orderId ?? null,
      order_reference: entry.reference ?? null,
      duration_ms: entry.durationMs,
      error_message: entry.error ?? null,
    });
  } catch {
    /* logging must never break the API */
  }
}

// ---------- validation ----------

const ModifierSchema = z.object({
  option_name: z.string().min(1).max(200),
  extra_price: z.number().min(0).max(100000).default(0),
});

const ItemSchema = z.object({
  product_id: z.string().uuid().nullish(),
  name: z.string().min(1).max(200),
  qty: z.number().positive().max(10000),
  unit_price: z.number().min(0).max(1000000),
  total: z.number().min(0).max(10000000).optional(),
  note: z.string().max(500).optional(),
  modifiers: z.array(ModifierSchema).max(20).optional(),
});

const OrderSchema = z
  .object({
    client_reference_id: z.string().min(3).max(100),
    branch_code: z.string().max(50).optional(),
    branch_id: z.string().uuid().optional(),
    customer_name: z.string().min(1).max(200),
    customer_phone: z.string().max(40).optional(),
    delivery_type: z.enum(["delivery", "takeaway", "pickup", "dine_in"]).default("takeaway"),
    delivery_address: z.string().max(500).optional(),
    delivery_fee: z.number().min(0).max(10000).default(0),
    payment_method: z.enum(["cash", "visa", "card", "wallet"]).default("cash"),
    items: z.array(ItemSchema).min(1).max(100),
    order_note: z.string().max(1000).optional(),
    scheduled_for: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.branch_code || v.branch_id, {
    message: "branch_code أو branch_id مطلوب — يجب تحديد الفرع المستلم للطلبية",
  });

// ---------- order handlers ----------

async function handleCreateOrder(req: Request, ownerId: string) {
  const started = Date.now();
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json", message: "جسم الطلب ليس JSON صالحاً" }, 400);
  }

  const parsed = OrderSchema.safeParse(payload);
  if (!parsed.success) {
    const res = { ok: false, error: "validation_failed", fields: parsed.error.flatten().fieldErrors };
    await logWebhook({ ownerId, eventType: "mobile_order", endpoint: "POST /orders", payload, status: 400, response: res, success: false, durationMs: Date.now() - started, error: "validation_failed" });
    return json(res, 400);
  }
  const body = parsed.data;

  // 1) Idempotency — same reference returns the existing order
  const { data: existing } = await admin
    .from("call_center_orders")
    .select("id, status, total, created_at, target_branch_name")
    .eq("user_id", ownerId)
    .eq("client_reference_id", body.client_reference_id)
    .maybeSingle();
  if (existing) {
    return json({
      ok: true,
      deduplicated: true,
      order_id: existing.id,
      reference: body.client_reference_id,
      status: existing.status,
      total: existing.total,
      branch_name: existing.target_branch_name,
      created_at: existing.created_at,
    });
  }

  // 2) Resolve branch (must belong to this company and be active)
  let branchQuery = admin
    .from("branches")
    .select("id, name, branch_code")
    .eq("user_id", ownerId)
    .eq("is_active", true);
  if (body.branch_id) branchQuery = branchQuery.eq("id", body.branch_id);
  else branchQuery = branchQuery.eq("branch_code", body.branch_code!);
  const { data: branch } = await branchQuery.maybeSingle();
  if (!branch) {
    const res = { ok: false, error: "branch_not_found", message: "الفرع غير موجود أو غير فعّال لهذه الشركة" };
    await logWebhook({ ownerId, eventType: "mobile_order", endpoint: "POST /orders", payload, status: 400, response: res, success: false, reference: body.client_reference_id, durationMs: Date.now() - started, error: "branch_not_found" });
    return json(res, 400);
  }

  // 3) Normalize items + totals (server is source of truth)
  const items = body.items.map((it) => {
    const mods = (it.modifiers || []).map((m) => ({ option_name: m.option_name, extra_price: m.extra_price }));
    const modsExtra = mods.reduce((s, m) => s + (m.extra_price || 0), 0);
    const lineTotal = it.total ?? (it.unit_price + modsExtra) * it.qty;
    return {
      product_id: it.product_id ?? null,
      name: it.name,
      qty: it.qty,
      unit_price: it.unit_price,
      total: Math.round(lineTotal * 100) / 100,
      note: it.note || "",
      modifiers: mods,
    };
  });
  const itemsTotal = items.reduce((s, it) => s + it.total, 0);
  const total = Math.round((itemsTotal + (body.delivery_fee || 0)) * 100) / 100;
  const payment = body.payment_method === "card" ? "visa" : body.payment_method;
  const deliveryType = body.delivery_type === "pickup" ? "takeaway" : body.delivery_type;

  // 4) Insert into the POS staging table (same shape the Kiosk writes)
  const { data: inserted, error: insertErr } = await admin
    .from("call_center_orders")
    .insert({
      user_id: ownerId,
      source_app: "MOBILE_APP",
      target_branch_id: branch.id,
      target_branch_name: branch.name,
      customer_name: body.customer_name.trim(),
      customer_phone: body.customer_phone?.trim() || null,
      delivery_type: deliveryType,
      delivery_address: body.delivery_address || null,
      payment_method: payment,
      items: items as any,
      total,
      order_note: body.order_note || null,
      status: "pending",
      dispatched_by_name: "تطبيق الجوال",
      delivery_fee: body.delivery_fee || 0,
      delivery_info: {
        source: "mobile_app",
        order_number: body.client_reference_id,
        client_reference_id: body.client_reference_id,
      } as any,
      skip_wheels_dispatch: true,
      client_reference_id: body.client_reference_id,
      is_scheduled: !!body.scheduled_for,
      scheduled_for: body.scheduled_for || null,
    } as any)
    .select("id")
    .single();

  if (insertErr) {
    // Unique-violation on (user_id, client_reference_id) → a concurrent retry won the race
    if ((insertErr as any).code === "23505") {
      const { data: dup } = await admin
        .from("call_center_orders")
        .select("id, status, total, created_at, target_branch_name")
        .eq("user_id", ownerId)
        .eq("client_reference_id", body.client_reference_id)
        .maybeSingle();
      if (dup) {
        return json({ ok: true, deduplicated: true, order_id: dup.id, reference: body.client_reference_id, status: dup.status, total: dup.total, branch_name: dup.target_branch_name, created_at: dup.created_at });
      }
    }
    const res = { ok: false, error: "insert_failed", message: insertErr.message };
    await logWebhook({ ownerId, eventType: "mobile_order", endpoint: "POST /orders", payload, status: 500, response: res, success: false, reference: body.client_reference_id, durationMs: Date.now() - started, error: insertErr.message });
    return json(res, 500);
  }

  // 5) Best-effort customer upsert (same as Kiosk flow)
  const phoneDigits = (body.customer_phone || "").replace(/\D/g, "");
  if (phoneDigits.length >= 7) {
    try {
      const { data: existingCust } = await admin
        .from("pos_customers")
        .select("id, total_visits, total_spent")
        .eq("user_id", ownerId)
        .eq("whatsapp", phoneDigits)
        .maybeSingle();
      if (existingCust) {
        await admin.from("pos_customers").update({
          total_visits: (existingCust.total_visits || 0) + 1,
          total_spent: (existingCust.total_spent || 0) + total,
          last_visit: new Date().toISOString(),
        }).eq("id", existingCust.id);
      } else {
        await admin.from("pos_customers").insert({
          user_id: ownerId,
          name: body.customer_name.trim(),
          whatsapp: phoneDigits,
          total_visits: 1,
          total_spent: total,
          last_visit: new Date().toISOString(),
        } as any);
      }
    } catch { /* non-blocking */ }
  }

  const res = {
    ok: true,
    deduplicated: false,
    order_id: inserted.id,
    reference: body.client_reference_id,
    status: "pending",
    total,
    branch_name: branch.name,
    message: "تم استلام الطلبية وتحويلها لشاشة الكاشير",
  };
  await logWebhook({ ownerId, eventType: "mobile_order", endpoint: "POST /orders", payload, status: 201, response: res, success: true, orderId: inserted.id, reference: body.client_reference_id, durationMs: Date.now() - started });
  return json(res, 201);
}

async function handleGetOrder(ownerId: string, reference: string) {
  const { data } = await admin
    .from("call_center_orders")
    .select("id, status, total, created_at, accepted_at, delivered_at, cancelled_at, cancel_reason, target_branch_name, pos_order_id, payment_method, delivery_type")
    .eq("user_id", ownerId)
    .eq("client_reference_id", reference)
    .maybeSingle();
  if (!data) {
    return json({ ok: false, error: "not_found", message: "لا توجد طلبية بهذا المرجع" }, 404);
  }
  return json({
    ok: true,
    order_id: data.id,
    reference,
    status: data.status, // pending | accepted | completed | cancelled ...
    total: data.total,
    branch_name: data.target_branch_name,
    payment_method: data.payment_method,
    delivery_type: data.delivery_type,
    pos_order_id: data.pos_order_id,
    created_at: data.created_at,
    accepted_at: data.accepted_at,
    cancelled_at: data.cancelled_at,
    cancel_reason: data.cancel_reason,
  });
}

async function handleListBranches(ownerId: string) {
  const { data } = await admin
    .from("branches")
    .select("id, name, branch_code, address")
    .eq("user_id", ownerId)
    .eq("is_active", true)
    .order("name");
  return json({ ok: true, branches: data || [] });
}

// ---------- key management (dashboard user JWT) ----------

async function handleListKeys(userId: string) {
  const { data } = await admin
    .from("external_api_keys")
    .select("id, label, key_prefix, is_active, last_used_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return json({ ok: true, keys: data || [] });
}

async function handleCreateKey(req: Request, userId: string) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const label = String(body?.label || "").trim().slice(0, 100) || "تطبيق الجوال";
  const rawKey = generateApiKey();
  const hash = await sha256Hex(rawKey);
  const { data, error } = await admin
    .from("external_api_keys")
    .insert({ user_id: userId, label, key_hash: hash, key_prefix: rawKey.slice(0, 16) })
    .select("id, label, key_prefix, created_at")
    .single();
  if (error) return json({ ok: false, error: "create_failed", message: error.message }, 500);
  return json({ ok: true, key: { ...data, api_key: rawKey } }, 201); // raw key shown ONCE
}

async function handleRevokeKey(userId: string, keyId: string) {
  const { data, error } = await admin
    .from("external_api_keys")
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return json({ ok: false, error: "revoke_failed", message: error.message }, 500);
  if (!data) return json({ ok: false, error: "not_found" }, 404);
  return json({ ok: true });
}

// ---------- router ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // path after the function name, e.g. /orders, /orders/REF-123, /admin/keys
  const path = url.pathname.replace(/^\/mobile-orders-api\/?/, "/").replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);

  try {
    // --- admin (dashboard) routes: user JWT ---
    if (segments[0] === "admin" && segments[1] === "keys") {
      const userId = await resolveUser(req);
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      if (req.method === "GET") return await handleListKeys(userId);
      if (req.method === "POST") return await handleCreateKey(req, userId);
      if (req.method === "DELETE" && segments[2]) return await handleRevokeKey(userId, segments[2]);
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    // --- app routes: API key ---
    const keyCtx = await resolveApiKey(req);
    if (!keyCtx) {
      return json({ ok: false, error: "unauthorized", message: "مفتاح API غير صالح أو موقوف" }, 401);
    }

    if (segments[0] === "orders" && req.method === "POST" && segments.length === 1) {
      return await handleCreateOrder(req, keyCtx.ownerId);
    }
    if (segments[0] === "orders" && req.method === "GET" && segments.length === 2) {
      return await handleGetOrder(keyCtx.ownerId, decodeURIComponent(segments[1]));
    }
    if (segments[0] === "branches" && req.method === "GET") {
      return await handleListBranches(keyCtx.ownerId);
    }

    return json({ ok: false, error: "not_found", message: "المسار غير موجود" }, 404);
  } catch (e) {
    return json({ ok: false, error: "internal_error", message: String((e as Error)?.message || e) }, 500);
  }
});
