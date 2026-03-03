import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify JWT and super_admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "جلسة غير صالحة" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role using service client
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "ليس لديك صلاحية Super Admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    // Log access
    const logAction = async (actionName: string, targetType?: string, targetId?: string, details?: any) => {
      await admin.from("super_admin_audit_logs").insert({
        admin_user_id: user.id,
        action: actionName,
        target_type: targetType,
        target_id: targetId,
        details: details || {},
        ip_address: ip,
        user_agent: ua,
      });
    };

    // ─── ACTIONS ───
    if (action === "dashboard") {
      await logAction("view_dashboard");

      // Get counts using service role (bypasses RLS)
      const [profilesRes, transactionsRes, posSessionsRes, accountsRes, contactsRes, auditRes] = await Promise.all([
        admin.from("profiles").select("id, display_name, created_at, user_id", { count: "exact" }),
        admin.from("transactions").select("id, amount, transaction_date, transaction_type, user_id", { count: "exact" }).gte("transaction_date", new Date().toISOString().split("T")[0]),
        admin.from("pos_sessions").select("id, status, total_sales, total_orders, created_at, user_id", { count: "exact" }).eq("status", "open"),
        admin.from("accounts").select("id", { count: "exact" }),
        admin.from("contacts").select("id", { count: "exact" }),
        admin.from("super_admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

      // Today's revenue from transactions
      const todayTx = transactionsRes.data || [];
      const todayRevenue = todayTx
        .filter((t: any) => ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale", "receipt"].includes(t.transaction_type))
        .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);

      // New users today
      const today = new Date().toISOString().split("T")[0];
      const newUsersToday = (profilesRes.data || []).filter((p: any) => p.created_at?.startsWith(today)).length;

      // Active sessions
      const activeSessions = posSessionsRes.data || [];
      const activeSessionsRevenue = activeSessions.reduce((s: number, ss: any) => s + (Number(ss.total_sales) || 0), 0);

      return new Response(JSON.stringify({
        stats: {
          total_users: profilesRes.count || 0,
          new_users_today: newUsersToday,
          total_accounts: accountsRes.count || 0,
          total_contacts: contactsRes.count || 0,
          active_sessions: activeSessions.length,
          active_sessions_revenue: activeSessionsRevenue,
          today_revenue: todayRevenue,
          today_transactions: todayTx.length,
        },
        recent_activity: auditRes.data || [],
        users: (profilesRes.data || []).map((p: any) => ({
          id: p.user_id,
          display_name: p.display_name,
          created_at: p.created_at,
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "users") {
      await logAction("view_users");

      const { data: profiles } = await admin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      // Get roles for all users
      const { data: roles } = await admin.from("user_roles").select("*");

      // Get auth users for email/last sign in
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });

      const enriched = (profiles || []).map((p: any) => {
        const authUser = authUsers?.find((u: any) => u.id === p.user_id);
        const userRoles = (roles || []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role);
        return {
          ...p,
          email: authUser?.email,
          phone: authUser?.phone,
          last_sign_in: authUser?.last_sign_in_at,
          is_banned: authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false,
          roles: userRoles,
        };
      });

      return new Response(JSON.stringify({ users: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "suspend_user") {
      const body = await req.json();
      const targetUserId = body.user_id;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id مطلوب" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ban user for 100 years (effectively permanent)
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: "876000h",
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("suspend_user", "user", targetUserId, { reason: body.reason });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unsuspend_user") {
      const body = await req.json();
      const targetUserId = body.user_id;
      
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("unsuspend_user", "user", targetUserId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const body = await req.json();
      const targetUserId = body.user_id;
      const newPassword = body.new_password;

      if (!targetUserId || !newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "كلمة مرور غير صالحة (6 أحرف على الأقل)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("reset_password", "user", targetUserId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const body = await req.json();
      const targetUserId = body.user_id;
      const confirmation = body.confirmation;

      if (confirmation !== "DELETE") {
        return new Response(JSON.stringify({ error: "يجب كتابة DELETE للتأكيد" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow deleting self
      if (targetUserId === user.id) {
        return new Response(JSON.stringify({ error: "لا يمكنك حذف حسابك الخاص" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("delete_user", "user", targetUserId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "audit_logs") {
      const page = parseInt(url.searchParams.get("page") || "0");
      const limit = 50;

      const { data, count } = await admin
        .from("super_admin_audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      return new Response(JSON.stringify({ logs: data || [], total: count || 0, page }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_password") {
      const body = await req.json();
      const { data, error } = await anonClient.auth.signInWithPassword({
        email: user.email!,
        password: body.password,
      });

      if (error || !data.user) {
        return new Response(JSON.stringify({ verified: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("verify_password", "self", user.id);
      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "table_data") {
      const tableName = url.searchParams.get("table");
      const page = parseInt(url.searchParams.get("page") || "0");
      const limit = 50;
      const allowedTables = [
        "profiles", "accounts", "transactions", "contacts", "employees",
        "pos_sessions", "pos_orders", "cheques", "currencies", "branches",
        "user_roles", "products", "invoices", "employee_payroll",
        "plans", "subscriptions",
      ];

      if (!tableName || !allowedTables.includes(tableName)) {
        return new Response(JSON.stringify({ error: "جدول غير مسموح" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("view_table", "table", tableName, { page });

      const { data, count } = await admin
        .from(tableName)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      return new Response(JSON.stringify({ data: data || [], total: count || 0, page }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SUBSCRIPTIONS ───
    if (action === "subscriptions") {
      await logAction("view_subscriptions");

      const { data: subs } = await admin
        .from("subscriptions")
        .select("*, plans(name, plan_key, monthly_price)")
        .order("created_at", { ascending: false });

      // Enrich with user info
      const { data: profiles } = await admin.from("profiles").select("user_id, display_name, company_name");
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });

      const enriched = (subs || []).map((s: any) => {
        const profile = (profiles || []).find((p: any) => p.user_id === s.user_id);
        const authUser = authUsers?.find((u: any) => u.id === s.user_id);
        return {
          ...s,
          display_name: profile?.display_name || "—",
          company_name: profile?.company_name || "",
          email: authUser?.email || "",
        };
      });

      return new Response(JSON.stringify({ subscriptions: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_subscription") {
      const body = await req.json();
      const { subscription_id, plan_id, status, billing_cycle } = body;

      if (!subscription_id) {
        return new Response(JSON.stringify({ error: "subscription_id مطلوب" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateData: any = {};
      if (plan_id) updateData.plan_id = plan_id;
      if (status) updateData.status = status;
      if (billing_cycle) updateData.billing_cycle = billing_cycle;

      // If activating, set period
      if (status === "active") {
        updateData.current_period_start = new Date().toISOString();
        const end = new Date();
        end.setMonth(end.getMonth() + (billing_cycle === "annual" ? 12 : 1));
        updateData.current_period_end = end.toISOString();
      }

      if (status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { error } = await admin.from("subscriptions").update(updateData).eq("id", subscription_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("update_subscription", "subscription", subscription_id, updateData);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "assign_subscription") {
      const body = await req.json();
      const { target_user_id, plan_id, billing_cycle, status } = body;

      if (!target_user_id || !plan_id) {
        return new Response(JSON.stringify({ error: "user_id و plan_id مطلوبين" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if user already has subscription
      const { data: existing } = await admin.from("subscriptions").select("id").eq("user_id", target_user_id).maybeSingle();

      if (existing) {
        // Update existing
        const end = new Date();
        end.setMonth(end.getMonth() + (billing_cycle === "annual" ? 12 : 1));
        await admin.from("subscriptions").update({
          plan_id,
          billing_cycle: billing_cycle || "monthly",
          status: status || "active",
          current_period_start: new Date().toISOString(),
          current_period_end: end.toISOString(),
        }).eq("id", existing.id);
      } else {
        const end = new Date();
        end.setMonth(end.getMonth() + (billing_cycle === "annual" ? 12 : 1));
        await admin.from("subscriptions").insert({
          user_id: target_user_id,
          plan_id,
          billing_cycle: billing_cycle || "monthly",
          status: status || "active",
          current_period_start: new Date().toISOString(),
          current_period_end: end.toISOString(),
        });
      }

      await logAction("assign_subscription", "user", target_user_id, { plan_id, billing_cycle });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
