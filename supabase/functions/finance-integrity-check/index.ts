import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Auth: require a valid user JWT with admin/super_admin role ──────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authErr } = await sb.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    const isSuperAdmin = roles.includes("super_admin");
    const isAdmin = roles.includes("admin");
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "ACCESS_DENIED" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tenant scope: super_admins may inspect any owner; admins are pinned to
    // their own tenant regardless of what the query string asks for.
    const url = new URL(req.url);
    const requestedOwner = url.searchParams.get("owner_id");
    const owner = isSuperAdmin ? requestedOwner : user.id;

    const results: Record<string, unknown> = {};

    // 1. Unbalanced vouchers (sum of lines != 0)
    const { data: unbalanced, error: e1 } = await sb.rpc("find_unbalanced_vouchers" as any, owner ? { _owner: owner } : {});
    if (!e1) results.unbalanced_vouchers = unbalanced;

    // 2. Orphan payments (payments without invoice links)
    const paymentsQuery = sb
      .from("payments")
      .select("id", { count: "exact", head: true })
      .is("invoice_id", null);
    if (owner) paymentsQuery.eq("data_owner_id", owner);
    const { count: orphanPayments } = await paymentsQuery;
    results.orphan_payments = orphanPayments ?? 0;

    // 3. Cash transfers without GL entries
    const transfersQuery = sb
      .from("cash_transfers")
      .select("id", { count: "exact", head: true })
      .is("transaction_id", null);
    if (owner) transfersQuery.eq("data_owner_id", owner);
    const { count: orphanTransfers } = await transfersQuery;
    results.orphan_cash_transfers = orphanTransfers ?? 0;

    // 4. Recent fix log entries
    const logQuery = sb
      .from("finance_integrity_fix_log")
      .select("action, count:id", { count: "exact" })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    if (owner) logQuery.eq("data_owner_id", owner);
    const { data: recentFixes } = await logQuery;
    results.recent_fixes_7d = recentFixes?.length ?? 0;

    results.checked_at = new Date().toISOString();

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});