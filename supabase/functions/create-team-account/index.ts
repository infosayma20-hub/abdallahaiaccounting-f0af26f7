import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof Response) return auth;
    const { userId } = auth;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check admin role
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!hasAdmin) {
      return json({ error: "ليس لديك صلاحية" }, 403);
    }

    const body = await req.json();
    const { action, full_name, email, password, role, permissions } = body;

    if (!full_name || !email || !password || !role) {
      return json({ error: "البيانات ناقصة" }, 400);
    }

    if (password.length < 6) {
      return json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, 400);
    }

    if (!["accountant_senior", "accountant_sales", "accountant_purchases", "hr_manager"].includes(role)) {
      return json({ error: "نوع الحساب غير صالح" }, 400);
    }

    // Get admin's company info
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("company_name, company_id")
      .eq("user_id", userId)
      .single();

    // Create auth user
    let newUserId: string;
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
        invited_by: userId,
        company_name: adminProfile?.company_name || "شركتي",
      },
    });

    if (createErr) {
      if (createErr.message?.includes("already been registered")) {
        return json({ error: "البريد الإلكتروني مسجل مسبقاً" }, 400);
      }
      return json({ error: createErr.message }, 400);
    }

    newUserId = newUser.user!.id;

    // Update profile
    await supabase
      .from("profiles")
      .update({
        invited_by: userId,
        company_id: adminProfile?.company_id,
        role,
      })
      .eq("user_id", newUserId);

    // Set role
    await supabase.from("user_roles").delete().eq("user_id", newUserId);
    await supabase.from("user_roles").insert({ user_id: newUserId, role });

    // Save permissions
    if (role.startsWith("accountant")) {
      const perms = permissions || {};
      await supabase.from("accountant_permissions").insert({
        user_id: userId,
        accountant_auth_id: newUserId,
        full_name,
        email,
        ...perms,
      });
    } else if (role === "hr_manager") {
      const perms = permissions || {};
      await supabase.from("hr_manager_permissions").insert({
        user_id: userId,
        hr_auth_id: newUserId,
        full_name,
        email,
        ...perms,
      });
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: userId,
      actor_id: userId,
      actor_name: adminProfile?.company_name || "",
      action: "create_team_account",
      entity_type: "user",
      entity_id: newUserId,
      entity_label: full_name,
      details: { email, role },
    });

    return json({
      success: true,
      auth_user_id: newUserId,
      message: `تم إنشاء حساب ${full_name} بنجاح ✅`,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
