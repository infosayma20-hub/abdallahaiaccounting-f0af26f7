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

    const { employee_id, mode, is_call_center } = await req.json();
    if (!employee_id || !mode) return json({ error: "employee_id و mode مطلوبان" }, 400);
    if (!["enable", "disable"].includes(mode)) return json({ error: "mode غير صالح" }, 400);

    // Load employee
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, full_name, email, phone, auth_user_id, user_id")
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
      .select("id, role, is_active, is_call_center")
      .eq("auth_user_id", emp.auth_user_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (mode === "disable") {
      if (!existing) return json({ success: true, message: "لا يوجد حساب POS لإيقافه" });
      await supabase.from("pos_users").update({ is_active: false }).eq("id", existing.id);
      return json({ success: true, message: `تم إيقاف صلاحية POS لـ ${emp.full_name}` });
    }

    // mode === "enable"
    const isCC = !!is_call_center;
    const targetRole = "cashier"; // call_center is just a flag on cashier

    let posUserId: string;
    if (existing) {
      await supabase
        .from("pos_users")
        .update({
          is_active: true,
          role: targetRole,
          is_call_center: isCC,
          name: emp.full_name,
          email: emp.email,
          phone: emp.phone,
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
          auth_user_id: emp.auth_user_id,
          has_account: true,
          account_status: "active",
          pin_hash: "no-pin",
          created_by: userId,
          is_active: true,
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
      message: `تم تفعيل ${isCC ? "كول سنتر" : "كاشير"} لـ ${emp.full_name}`,
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