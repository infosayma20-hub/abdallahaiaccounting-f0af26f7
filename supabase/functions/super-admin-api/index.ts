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

      if (!targetUserId || !newPassword || newPassword.length < 8) {
        return new Response(JSON.stringify({ error: "كلمة مرور غير صالحة (8 أحرف على الأقل)" }), {
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

      // Clear auth_user_id references from related tables (FKs without CASCADE block deletion)
      await Promise.all([
        admin.from("employees").update({ auth_user_id: null }).eq("auth_user_id", targetUserId),
        admin.from("pos_sessions").update({ cashier_auth_user_id: null }).eq("cashier_auth_user_id", targetUserId),
      ]);

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

      // Get admin user IDs only
      const { data: adminRoles } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      const adminUserIds = new Set((adminRoles || []).map((r: any) => r.user_id));

      // Filter subscriptions to admin users only
      const adminSubs = (subs || []).filter((s: any) => adminUserIds.has(s.user_id));

      // Enrich with user info
      const { data: profiles } = await admin.from("profiles").select("user_id, display_name, company_name");
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });

      const enriched = adminSubs.map((s: any) => {
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
      const { subscription_id, plan_id, status, billing_cycle, period_end, custom_amount, custom_currency, agreement_type, period_start } = body;

      if (!subscription_id) {
        return new Response(JSON.stringify({ error: "subscription_id مطلوب" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Snapshot BEFORE for diff/audit ──
      const { data: beforeRow } = await admin
        .from("subscriptions")
        .select("plan_id, status, billing_cycle, current_period_start, current_period_end, trial_ends_at, custom_amount, custom_currency, agreement_type, user_id")
        .eq("id", subscription_id)
        .single();

      if (!beforeRow) {
        return new Response(JSON.stringify({ error: "الاشتراك غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateData: any = {};
      if (plan_id) updateData.plan_id = plan_id;
      if (status) updateData.status = status;
      if (billing_cycle) updateData.billing_cycle = billing_cycle;
      if (custom_amount !== undefined) updateData.custom_amount = custom_amount || null;
      if (custom_currency !== undefined) updateData.custom_currency = custom_currency;
      if (agreement_type !== undefined) updateData.agreement_type = agreement_type;

      // ── Dates: respect what the admin entered, otherwise compute from cycle ──
      if (period_start) {
        updateData.current_period_start = new Date(period_start + "T00:00:00Z").toISOString();
      }
      if (period_end) {
        updateData.current_period_end = new Date(period_end + "T23:59:59Z").toISOString();
      }

      // If status becomes active without explicit dates, default to a fresh period from today
      if (status === "active" && !period_start && !period_end) {
        const now = new Date();
        updateData.current_period_start = now.toISOString();
        const end = new Date(now);
        end.setMonth(end.getMonth() + (billing_cycle === "annual" ? 12 : 1));
        updateData.current_period_end = end.toISOString();
      }

      // ── Trial handling: explicit and unambiguous ──
      if (status === "trial") {
        // Trial: trial_ends_at MUST mirror period_end
        updateData.trial_ends_at = updateData.current_period_end ?? beforeRow.current_period_end;
      } else if (status && status !== "trial") {
        // Active / expired / cancelled / suspended: clear trial flag to avoid UI confusion
        updateData.trial_ends_at = null;
      }

      if (status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { data: afterRow, error } = await admin
        .from("subscriptions")
        .update(updateData)
        .eq("id", subscription_id)
        .select("plan_id, status, billing_cycle, current_period_start, current_period_end, trial_ends_at, custom_amount, custom_currency, agreement_type, user_id")
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Cascade to team members ──
      let cascadedCount = 0;
      const ownerId = beforeRow.user_id;
      if (ownerId) {
        const { data: teamProfiles } = await admin
          .from("profiles")
          .select("user_id")
          .eq("invited_by", ownerId);

        if (teamProfiles && teamProfiles.length > 0) {
          const teamUserIds = teamProfiles.map((p: any) => p.user_id);
          const cascadeData: any = {};
          if (updateData.plan_id !== undefined) cascadeData.plan_id = updateData.plan_id;
          if (updateData.status !== undefined) cascadeData.status = updateData.status;
          if (updateData.current_period_start !== undefined) cascadeData.current_period_start = updateData.current_period_start;
          if (updateData.current_period_end !== undefined) cascadeData.current_period_end = updateData.current_period_end;
          if (updateData.trial_ends_at !== undefined) cascadeData.trial_ends_at = updateData.trial_ends_at;
          if (updateData.cancelled_at !== undefined) cascadeData.cancelled_at = updateData.cancelled_at;
          if (updateData.billing_cycle !== undefined) cascadeData.billing_cycle = updateData.billing_cycle;

          if (Object.keys(cascadeData).length > 0) {
            const { count } = await admin
              .from("subscriptions")
              .update(cascadeData, { count: "exact" })
              .in("user_id", teamUserIds)
              .select("id", { count: "exact", head: true });
            cascadedCount = count ?? teamUserIds.length;
          }
        }
      }

      // ── Build human-readable diff ──
      const diff: Record<string, { from: any; to: any }> = {};
      const trackFields = ["plan_id", "status", "billing_cycle", "current_period_start", "current_period_end", "trial_ends_at", "custom_amount", "custom_currency", "agreement_type"];
      for (const f of trackFields) {
        const b = (beforeRow as any)[f];
        const a = (afterRow as any)[f];
        if (String(b ?? "") !== String(a ?? "")) {
          diff[f] = { from: b, to: a };
        }
      }

      await logAction("update_subscription", "subscription", subscription_id, { diff, cascaded_count: cascadedCount });

      return new Response(JSON.stringify({
        success: true,
        before: beforeRow,
        after: afterRow,
        diff,
        cascaded_count: cascadedCount,
      }), {
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

    if (action === "revenue_stats") {
      await logAction("view_revenue_stats");

      // Get all subscriptions with plan info
      const { data: allSubs } = await admin
        .from("subscriptions")
        .select("*, plans(name, plan_key, monthly_price)");

      const subs = allSubs || [];

      // Calculate MRR (Monthly Recurring Revenue)
      const activeSubs = subs.filter((s: any) => s.status === "active");
      const mrr = activeSubs.reduce((sum: number, s: any) => {
        const price = s.plans?.monthly_price || 0;
        return sum + (s.billing_cycle === "annual" ? price * 0.8 : price);
      }, 0);

      // ARR
      const arr = mrr * 12;

      // Revenue by plan
      const revenueByPlan: Record<string, { count: number; revenue: number; name: string }> = {};
      activeSubs.forEach((s: any) => {
        const key = s.plans?.plan_key || "unknown";
        if (!revenueByPlan[key]) revenueByPlan[key] = { count: 0, revenue: 0, name: s.plans?.name || key };
        revenueByPlan[key].count++;
        const price = s.plans?.monthly_price || 0;
        revenueByPlan[key].revenue += (s.billing_cycle === "annual" ? price * 0.8 : price);
      });

      // Status breakdown
      const statusBreakdown: Record<string, number> = {};
      subs.forEach((s: any) => {
        statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
      });

      // Billing cycle breakdown
      const monthlyCount = activeSubs.filter((s: any) => s.billing_cycle === "monthly").length;
      const annualCount = activeSubs.filter((s: any) => s.billing_cycle === "annual").length;

      // Churn (cancelled in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCancelled = subs.filter((s: any) => 
        s.status === "cancelled" && s.cancelled_at && new Date(s.cancelled_at) >= thirtyDaysAgo
      ).length;

      // Trial conversion
      const trialSubs = subs.filter((s: any) => s.status === "trial");
      const convertedFromTrial = subs.filter((s: any) => s.status === "active").length;

      // Monthly trend (last 6 months) from created_at
      const monthlyTrend: { month: string; count: number; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthSubs = subs.filter((s: any) => s.created_at?.startsWith(monthKey));
        const monthRevenue = monthSubs
          .filter((s: any) => s.status === "active" || s.status === "trial")
          .reduce((sum: number, s: any) => sum + (s.plans?.monthly_price || 0), 0);
        monthlyTrend.push({
          month: monthKey,
          count: monthSubs.length,
          revenue: monthRevenue,
        });
      }

      // Expiring soon (next 7 days)
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const expiringSoon = subs.filter((s: any) =>
        (s.status === "active" || s.status === "trial") &&
        s.current_period_end && new Date(s.current_period_end) <= sevenDaysFromNow
      ).length;

      return new Response(JSON.stringify({
        mrr,
        arr,
        total_subscribers: subs.length,
        active_subscribers: activeSubs.length,
        trial_subscribers: trialSubs.length,
        revenue_by_plan: Object.values(revenueByPlan),
        status_breakdown: statusBreakdown,
        monthly_count: monthlyCount,
        annual_count: annualCount,
        recent_cancelled: recentCancelled,
        converted_from_trial: convertedFromTrial,
        monthly_trend: monthlyTrend,
        expiring_soon: expiringSoon,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESET USER TRANSACTIONS ───
    if (action === "reset_user_transactions") {
      const body = await req.json();
      const { target_user_id, password, categories } = body;

      if (!target_user_id || !password) {
        return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify super admin password
      const { error: signInError } = await anonClient.auth.signInWithPassword({
        email: user.email!,
        password,
      });
      if (signInError) {
        return new Response(JSON.stringify({ error: "كلمة المرور غير صحيحة" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get target user display name for audit
      const { data: targetProfile } = await admin.from("profiles").select("display_name").eq("user_id", target_user_id).maybeSingle();
      const targetName = targetProfile?.display_name || target_user_id;

      await logAction("reset_user_transactions", "user", target_user_id, { target_name: targetName, categories });

      // Category-based table groups
      const categoryTables: Record<string, string[]> = {
        pos: ["pos_payments", "pos_order_lines", "pos_orders", "pos_sessions"],
        call_center: ["call_center_orders"],
        invoices: ["invoice_lines", "invoices"],
        purchase_invoices: ["purchase_invoice_lines", "purchase_invoices"],
        vouchers: ["voucher_lines", "vouchers", "receipt_vouchers"],
        cheques: ["cheque_status_history", "cheques"],
        cash_transfers: ["cash_transfers"],
        loans: ["loan_installments", "employee_loans"],
        payroll: ["employee_payroll", "employee_financial_movements", "employee_deductions"],
        leaves: ["employee_leaves"],
        attendance: ["attendance_events", "attendance_days"],
        procurement: ["procurement_order_items", "procurement_orders", "procurement_requests"],
        contractor: ["contractor_transactions"],
        journals: ["transactions"],
        other: ["commissions", "contact_alerts", "document_edit_history", "sensitive_data_audit", "ai_messages", "ai_conversations", "activity_log"],
      };

      // If no categories specified, use all (backward compatible)
      const selectedCategories: string[] = categories && Array.isArray(categories) && categories.length > 0
        ? categories
        : Object.keys(categoryTables);

      // Build ordered list of tables to delete
      const transactionalTables: string[] = [];
      // Ensure correct FK order: journals last
      const orderedKeys = ["pos", "call_center", "cheques", "invoices", "purchase_invoices", "vouchers", "cash_transfers", "loans", "payroll", "leaves", "attendance", "procurement", "contractor", "other", "journals"];
      for (const key of orderedKeys) {
        if (selectedCategories.includes(key) && categoryTables[key]) {
          transactionalTables.push(...categoryTables[key]);
        }
      }

      const results: Record<string, number> = {};

      for (const table of transactionalTables) {
        try {
          const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", target_user_id);
          if (count && count > 0) {
            await admin.from(table).delete().eq("user_id", target_user_id);
            results[table] = count;
          }
        } catch (e: any) {
          // Some tables may use different column names or not exist
          try {
            // Try with auth_user_id for attendance tables
            const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("auth_user_id", target_user_id);
            if (count && count > 0) {
              await admin.from(table).delete().eq("auth_user_id", target_user_id);
              results[table] = count;
            }
          } catch {
            // Skip tables that don't match
          }
        }
      }

      // Also reset contact balances to 0
      await admin.from("contacts").update({ current_balance: 0 }).eq("user_id", target_user_id);

      return new Response(JSON.stringify({
        success: true,
        target_user: targetName,
        deleted: results,
        total_deleted: Object.values(results).reduce((a, b) => a + b, 0),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE HIDDEN APPS ───
    if (action === "update_hidden_apps") {
      const body = await req.json();
      const { target_user_id, hidden_apps } = body;
      if (!target_user_id) {
        return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if row exists, insert if not, then update
      const { data: existing } = await admin
        .from("company_settings")
        .select("id")
        .eq("user_id", target_user_id)
        .maybeSingle();

      let error;
      if (!existing) {
        const res = await admin
          .from("company_settings")
          .insert({ user_id: target_user_id, hidden_apps: hidden_apps || [] });
        error = res.error;
      } else {
        const res = await admin
          .from("company_settings")
          .update({ hidden_apps: hidden_apps || [] })
          .eq("user_id", target_user_id);
        error = res.error;
      }

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logAction("update_hidden_apps", "user", target_user_id, { hidden_apps });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET HIDDEN APPS ───
    if (action === "get_hidden_apps") {
      const target_user_id = url.searchParams.get("target_user_id");
      if (!target_user_id) {
        return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data } = await admin
        .from("company_settings")
        .select("hidden_apps")
        .eq("user_id", target_user_id)
        .maybeSingle();

      return new Response(JSON.stringify({ hidden_apps: (data as any)?.hidden_apps || [] }), {
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
