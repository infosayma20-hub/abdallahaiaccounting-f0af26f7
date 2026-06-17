import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate the admin/owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user: adminUser },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !adminUser) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role: admin / hr_manager / super_admin can manage employee accounts
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUser.id);
    const roleList = (callerRoles ?? []).map((r: any) => r.role);
    const allowed = roleList.some((r: string) =>
      ["admin", "hr_manager", "super_admin"].includes(r)
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "ليس لديك صلاحية" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Resolve the effective data-owner so sub-accounts (HR manager invited by owner)
    // can manage the owner's employees, not an empty tenant scoped to their own uid.
    let ownerId = adminUser.id;
    try {
      const { data: resolvedOwner } = await supabase.rpc("get_team_owner_id", {
        _user_id: adminUser.id,
      });
      if (resolvedOwner) ownerId = resolvedOwner as string;
    } catch (_) {
      // fall back to caller id
    }

    const body = await req.json();
    const action = body.action || "create";

    // ==================== DISABLE / ENABLE ACCOUNT ====================
    if (action === "disable-account" || action === "enable-account") {
      const { employee_id } = body;
      if (!employee_id) {
        return new Response(
          JSON.stringify({ error: "البيانات ناقصة" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: employee, error: empErr } = await supabase
        .from("employees")
        .select("id, full_name, auth_user_id")
        .eq("id", employee_id)
        .eq("user_id", adminUser.id)
        .single();

      if (empErr || !employee) {
        return new Response(
          JSON.stringify({ error: "الموظف غير موجود" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!employee.auth_user_id) {
        return new Response(
          JSON.stringify({ error: "هذا الموظف ليس لديه حساب" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const disable = action === "disable-account";

      // Guard 1: Prevent self-lockout
      if (disable && employee.auth_user_id === adminUser.id) {
        return new Response(
          JSON.stringify({ error: "لا يمكنك تعطيل حسابك الشخصي من هنا" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Guard 2: Block disabling other admins / super_admins
      if (disable) {
        const { data: targetRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", employee.auth_user_id);
        const roles = (targetRoles || []).map((r: any) => r.role);
        if (roles.includes("admin") || roles.includes("super_admin")) {
          return new Response(
            JSON.stringify({ error: "لا يمكن تعطيل حساب مدير عام. أزل صلاحية المدير أولاً." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Ban for 100 years to disable, or 'none' to re-enable
      const banDuration = disable ? "876000h" : "none";
      const { error: banErr } = await (supabase.auth.admin as any).updateUserById(
        employee.auth_user_id,
        { ban_duration: banDuration }
      );
      if (banErr) {
        return new Response(
          JSON.stringify({ error: banErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (disable) {
        // Force sign-out from all active sessions (revokes refresh tokens)
        try { await (supabase.auth.admin as any).signOut(employee.auth_user_id); } catch (_) {}
      }

      await supabase
        .from("employees")
        .update({
          auth_disabled: disable,
          auth_disabled_at: disable ? new Date().toISOString() : null,
          auth_disabled_by: disable ? adminUser.id : null,
        } as any)
        .eq("id", employee_id);

      return new Response(
        JSON.stringify({
          success: true,
          message: disable
            ? `تم تعطيل حساب ${employee.full_name} ولن يستطيع تسجيل الدخول ✅`
            : `تم إعادة تفعيل حساب ${employee.full_name} ✅`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== RESET PASSWORD ====================
    if (action === "reset-password") {
      const { employee_id, new_password } = body;

      if (!employee_id || !new_password) {
        return new Response(
          JSON.stringify({ error: "البيانات ناقصة" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (new_password.length < 3) {
        return new Response(
          JSON.stringify({ error: "كلمة المرور يجب أن تكون 3 أحرف على الأقل" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get employee
      const { data: employee, error: empErr } = await supabase
        .from("employees")
        .select("id, full_name, auth_user_id")
        .eq("id", employee_id)
        .eq("user_id", adminUser.id)
        .single();

      if (empErr || !employee) {
        return new Response(
          JSON.stringify({ error: "الموظف غير موجود" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!employee.auth_user_id) {
        return new Response(
          JSON.stringify({ error: "هذا الموظف ليس لديه حساب" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update password using admin API
      const { error: updateErr } = await supabase.auth.admin.updateUserById(
        employee.auth_user_id,
        { password: new_password }
      );

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: updateErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `تم إعادة تعيين كلمة مرور ${employee.full_name} بنجاح ✅`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== CREATE ACCOUNT ====================
    const { employee_id, email, password } = body;

    if (!employee_id || !email || !password) {
      return new Response(
        JSON.stringify({ error: "البيانات ناقصة: employee_id, email, password مطلوبة" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (password.length < 3) {
      return new Response(
        JSON.stringify({ error: "كلمة المرور يجب أن تكون 3 أحرف على الأقل" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify the employee belongs to this admin
    const { data: employee, error: empErr } = await supabase
      .from("employees")
      .select("id, full_name, auth_user_id, user_id")
      .eq("id", employee_id)
      .eq("user_id", adminUser.id)
      .single();

    if (empErr || !employee) {
      return new Response(
        JSON.stringify({ error: "الموظف غير موجود" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (employee.auth_user_id) {
      return new Response(
        JSON.stringify({ error: "هذا الموظف لديه حساب مسبقاً" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create auth user using admin API
    const { data: newUser, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: employee.full_name,
          role: "employee",
          invited_by: adminUser.id,
          company_name: "شركتي",
        },
      });

    if (createErr || !newUser?.user) {
      const msg = createErr?.message || "فشل إنشاء الحساب";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = newUser.user.id;

    // Link auth_user_id to employee record
    const { error: linkErr } = await supabase
      .from("employees")
      .update({ auth_user_id: newUserId, email })
      .eq("id", employee_id);

    if (linkErr) {
      return new Response(
        JSON.stringify({ error: "تم إنشاء الحساب لكن فشل الربط: " + linkErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Assign employee role
    const { error: roleErr } = await supabase
      .from("user_roles")
      .insert({ user_id: newUserId, role: "employee" })
      .select();

    if (roleErr && !roleErr.message?.includes("duplicate")) {
      console.error("Role assignment error:", roleErr);
    }

    // Ensure profile has invited_by set
    await supabase
      .from("profiles")
      .update({ invited_by: adminUser.id })
      .eq("user_id", newUserId)
      .is("invited_by", null);

    return new Response(
      JSON.stringify({
        success: true,
        message: `تم إنشاء حساب ${employee.full_name} بنجاح ✅`,
        auth_user_id: newUserId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
