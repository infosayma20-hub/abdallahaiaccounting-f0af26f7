import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Action = "list" | "upsert" | "reset";

interface Body {
  action: Action;
  target_user_id: string;
  app_key?: string;
  access_state?: "allow" | "deny" | "inherit";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function audit(svc: any, row: Record<string, unknown>) {
  try { await svc.from("activity_log").insert(row); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // User-scoped client (validates JWT)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
  const actor = userRes.user;

  // Service-role client (bypasses RLS) — needed for cross-tenant verification & audit
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const action = body?.action;
  const targetUserId = body?.target_user_id;
  if (!action || !targetUserId) return json({ error: "Missing action/target_user_id" }, 400);

  // Load both profiles
  const [{ data: actorProfile }, { data: targetProfile }] = await Promise.all([
    svc.from("profiles").select("user_id,company_id,invited_by").eq("user_id", actor.id).maybeSingle(),
    svc.from("profiles").select("user_id,company_id,invited_by").eq("user_id", targetUserId).maybeSingle(),
  ]);

  if (!actorProfile) return json({ error: "Actor profile missing" }, 403);
  if (!targetProfile) return json({ error: "Target user not found" }, 404);

  const isSelf = actor.id === targetUserId;
  const sameCompany = !!actorProfile.company_id && actorProfile.company_id === targetProfile.company_id;
  const invitedByActor = targetProfile.invited_by === actor.id;

  // Super-admin check
  const { data: roleRows } = await svc.from("user_roles").select("role").eq("user_id", actor.id);
  const roles = (roleRows || []).map((r: any) => r.role);
  const isSuperAdmin = roles.includes("super_admin");

  const canRead = isSelf || sameCompany || invitedByActor || isSuperAdmin;
  const canWrite = !isSelf && (sameCompany || invitedByActor || isSuperAdmin);

  if (!canRead) {
    await audit(svc, {
      actor_id: actor.id,
      action: "user_app_access_denied",
      entity_type: "user_app_access",
      entity_id: targetUserId,
      details: { reason: "cross_tenant_forbidden", actor_company_id: actorProfile.company_id, target_company_id: targetProfile.company_id },
    });
    return json({ error: "Cross-tenant forbidden" }, 403);
  }

  if (action === "list") {
    const { data, error } = await svc
      .from("user_app_access_overrides")
      .select("app_key,access_state")
      .eq("target_user_id", targetUserId);
    if (error) return json({ error: error.message }, 500);
    return json({ overrides: data || [] });
  }

  if (!canWrite) {
    await audit(svc, {
      actor_id: actor.id,
      action: "user_app_access_denied",
      entity_type: "user_app_access",
      entity_id: targetUserId,
      details: { reason: "cross_tenant_forbidden", actor_company_id: actorProfile.company_id, target_company_id: targetProfile.company_id, attempted: action },
    });
    return json({ error: "Cross-tenant forbidden" }, 403);
  }

  if (action === "upsert") {
    const appKey = body?.app_key?.trim();
    const state = body?.access_state;
    if (!appKey || !state) return json({ error: "Missing app_key/access_state" }, 400);

    // inherit = delete row
    if (state === "inherit") {
      const { error } = await svc
        .from("user_app_access_overrides")
        .delete()
        .eq("target_user_id", targetUserId)
        .eq("app_key", appKey);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, state: "inherit" });
    }

    if (state !== "allow" && state !== "deny") {
      return json({ error: "Invalid access_state" }, 400);
    }

    const { error } = await svc
      .from("user_app_access_overrides")
      .upsert(
        {
          target_user_id: targetUserId,
          app_key: appKey,
          access_state: state,
          created_by: actor.id,
          company_id: targetProfile.company_id,
          owner_id: targetProfile.invited_by || targetProfile.company_id || targetProfile.user_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "target_user_id,app_key" }
      );
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, state });
  }

  if (action === "reset") {
    const appKey = body?.app_key?.trim();
    const q = svc.from("user_app_access_overrides").delete().eq("target_user_id", targetUserId);
    const { error } = appKey ? await q.eq("app_key", appKey) : await q;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});