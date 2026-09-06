import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

/**
 * Provisions / updates a POS user from an employee record.
 * Triggered from the employee details page (Cashier / Call Center toggles).
 *
 * Actions:
 * - mode="enable" → creates pos_users row (or reactivates), sets role+call_center flag,
 *   ensures 'cashier' role in user_roles (preserves other roles like 'employee').
 * - mode="disable" → soft-disables pos_users.is_active=false. Keeps user_roles intact
 *   so the employee portal access is unaffected.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof Response) return auth;
    const { userId } = auth;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!hasAdmin) return json({ error: "ليس لديك صلاحية" }, 403);

    const { employee_id, mode, is_call_center, is_waiter } = await req.json();
    if (!employee_id || !mode) return json({ error: "employee_id و mode مطلوبان" }, 400);
    if (!["enable", "disable"].includes(mode)) return json({ error: "mode غير صالح" }, 400);

    // Load employee
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, full_name, email, phone, auth_user_id, user_id, branch_id")
      .eq("id", employee_id)
      .eq("user_id", userId)
      .single();

    if (empErr || !emp) return json({ error: "الموظف غير موجود" }, 404);
    if (!emp.auth_user_id) {
      return json({ error: "هذا الموظف لا يملك حساب دخول. أنشئ له حساباً أولاً." }, 400);
    }

    // Resolve pos_company_id (pos_users.company_id FKs to pos_companies, NOT companies)
    const { data: posCompany } = await supabase
      .from("pos_companies")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!posCompany?.id) {
      return json({ error: "لا توجد شركة POS مرتبطة بحسابك. افتح نقطة البيع مرة واحدة لإنشائها." }, 400);
    }

    // Find existing pos_users row for this auth account under same owner
    const { data: existing } = await supabase
      .from("pos_users")
      .select("id, role, is_active, is_call_center, is_waiter, branch_id, default_terminal_id")
      .eq("auth_user_id", emp.auth_user_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (mode === "disable") {
      if (!existing) return json({ success: true, message: "لا يوجد حساب POS لإيقافه" });
      await supabase.from("pos_users").update({ is_active: false }).eq("id", existing.id);
      return json({ success: true, message: `تم إيقاف صلاحية POS لـ ${emp.full_name}` });
    }

    // mode === "enable"
    const isWaiter = !!is_waiter;
    // الويتر يستخدم نفس مسار الكول سنتر: يفتح الطلب ويحوّله للكاشير بدون صندوق
    const isCC = !!is_call_center || isWaiter;
    const targetRole = "cashier"; // call_center is just a flag on cashier

    // Waiter tablets are not bound to a physical device: they need a branch +
    // a dedicated POS terminal on pos_users, otherwise POS opens "غير مهيأ"
    // and the waiter cannot open a shift or dispatch table orders.
    let waiterBranchId: string | null = (existing as any)?.branch_id ?? null;
    let waiterTerminalId: string | null = (existing as any)?.default_terminal_id ?? null;
    if (isWaiter && (!waiterBranchId || !waiterTerminalId)) {
      const branchId = waiterBranchId || emp.branch_id || null;
      if (!branchId) {
        return json({ error: "لا يوجد فرع مرتبط بالموظف. حدّد فرع الموظف أولاً ثم فعّل الويتر." }, 400);
      }
      waiterBranchId = branchId;
      if (!waiterTerminalId) {
        const terminalName = `ويتر — ${emp.full_name}`;
        const { data: existingTerm } = await supabase
          .from("pos_terminals")
          .select("id")
          .eq("user_id", userId)
          .eq("branch_id", branchId)
          .eq("name", terminalName)
          .maybeSingle();
        if (existingTerm?.id) {
          waiterTerminalId = existingTerm.id;
        } else {
          // copy GL account codes from an existing terminal of the same branch
          const { data: tpl } = await supabase
            .from("pos_terminals")
            .select("cash_account_code, revenue_account_code, cogs_account_code, inventory_account_code, receivable_account_code, discount_account_code")
            .eq("user_id", userId)
            .eq("branch_id", branchId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          const { data: newTerm, error: termErr } = await supabase
            .from("pos_terminals")
            .insert({
              user_id: userId,
              company_id: posCompany.id,
              branch_id: branchId,
              name: terminalName,
              is_active: true,
              ...(tpl || {}),
            })
            .select("id")
            .single();
          if (termErr) return json({ error: `تعذّر إنشاء محطة الويتر: ${termErr.message}` }, 500);
          waiterTerminalId = newTerm.id;
        }
      }
    }

    let posUserId: string;
    if (existing) {
      await supabase
        .from("pos_users")
        .update({
          is_active: true,
          role: targetRole,
          is_call_center: isCC,
          is_waiter: isWaiter,
          name: emp.full_name,
          email: emp.email,
          phone: emp.phone,
          ...(isWaiter && waiterBranchId && waiterTerminalId
            ? { branch_id: waiterBranchId, default_terminal_id: waiterTerminalId }
            : {}),
        })
        .eq("id", existing.id);
      posUserId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("pos_users")
        .insert({
          user_id: userId,
          company_id: posCompany.id,
          name: emp.full_name,
          email: emp.email,
          phone: emp.phone,
          role: targetRole,
          is_call_center: isCC,
          is_waiter: isWaiter,
          auth_user_id: emp.auth_user_id,
          has_account: true,
          account_status: "active",
          pin_hash: "no-pin",
          created_by: userId,
          is_active: true,
          ...(isWaiter && waiterBranchId && waiterTerminalId
            ? { branch_id: waiterBranchId, default_terminal_id: waiterTerminalId }
            : {}),
        })
        .select("id")
        .single();
      if (insErr) return json({ error: insErr.message }, 500);
      posUserId = inserted.id;
    }

    // Ensure cashier role exists (preserves other roles like 'employee')
    const { data: hasCashier } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", emp.auth_user_id)
      .eq("role", "cashier")
      .maybeSingle();

    if (!hasCashier) {
      await supabase
        .from("user_roles")
        .insert({ user_id: emp.auth_user_id, role: "cashier" });
    }

    return json({
      success: true,
      pos_user_id: posUserId,
      message: `تم تفعيل ${isWaiter ? "ويتر" : isCC ? "كول سنتر" : "كاشير"} لـ ${emp.full_name}`,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}