import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

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

    const { pos_user_id, email, password, send_invite, pos_role } = await req.json();

    if (!pos_user_id || !email || !password) {
      return json({ error: "بيانات ناقصة" }, 400);
    }

    if (password.length < 3) {
      return json({ error: "كلمة المرور يجب أن تكون 3 أحرف على الأقل" }, 400);
    }

    // Get POS user
    const { data: posUser, error: puErr } = await supabase
      .from("pos_users")
      .select("id, name, company_id, has_account, auth_user_id, user_id, email")
      .eq("id", pos_user_id)
      .eq("user_id", userId)
      .single();

    if (puErr || !posUser) {
      return json({ error: "الموظف غير موجود" }, 404);
    }

    // If already has account with same email, just sync role and exit (idempotent)
    if (posUser.has_account && posUser.auth_user_id && posUser.email?.toLowerCase() === email.toLowerCase()) {
      await ensureCashierRole(supabase, posUser.auth_user_id);
      if (pos_role) {
        await supabase.from("pos_users").update({ role: pos_role }).eq("id", pos_user_id);
      }
      return json({
        success: true,
        message: `${posUser.name} لديه حساب مفعّل بالفعل ✅`,
        auth_user_id: posUser.auth_user_id,
        already_exists: true,
      });
    }

    // Get admin's company info
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("company_name, company_id")
      .eq("user_id", userId)
      .single();

    // Try to create user first; if email exists, find the existing one
    let newUserId: string;

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: posUser.name,
        role: "employee",
        invited_by: userId,
        company_name: adminProfile?.company_name || "شركتي",
      },
    });

    if (createErr) {
      // If email already registered, find the existing user
      if (createErr.message?.includes("already been registered")) {
        const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existingUser = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (!existingUser) {
          return json({ error: "البريد مسجل لكن لم يتم العثور على الحساب" }, 400);
        }

        // Check if linked to ANOTHER POS user
        const { data: linkedPOS } = await supabase
          .from("pos_users")
          .select("id, name")
          .eq("auth_user_id", existingUser.id)
          .neq("id", pos_user_id)
          .maybeSingle();

        if (linkedPOS) {
          return json({ error: `هذا البريد مرتبط بموظف POS آخر (${linkedPOS.name})` }, 409);
        }

        newUserId = existingUser.id;
      } else {
        return json({ error: createErr.message || "فشل إنشاء الحساب" }, 400);
      }
    } else if (!newUser?.user) {
      return json({ error: "فشل إنشاء الحساب" }, 400);
    } else {
      newUserId = newUser.user.id;
    }

    // ── Role management ──
    // Remove any auto-assigned 'admin' role (from auto_assign_admin_role trigger)
    // but PRESERVE 'employee' role so the user can also access the employee portal.
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", newUserId)
      .eq("role", "admin");

    // Ensure cashier role exists (idempotent via unique constraint)
    await ensureCashierRole(supabase, newUserId);

    // ── Ensure profile is correctly linked to admin's team ──
    await supabase
      .from("profiles")
      .update({
        invited_by: userId,
        company_id: adminProfile?.company_id || null,
        role: "cashier",
      })
      .eq("user_id", newUserId);

    // Update POS user with account link and selected POS role
    const posUpdate: Record<string, unknown> = {
      has_account: true,
      auth_user_id: newUserId,
      account_status: "active",
      email,
    };
    if (pos_role) posUpdate.role = pos_role;
    await supabase.from("pos_users").update(posUpdate).eq("id", pos_user_id);

    // Also create/link employee record if not exists
    const { data: existingEmp } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_user_id", newUserId)
      .maybeSingle();

    if (!existingEmp) {
      await supabase.from("employees").insert({
        user_id: userId,
        full_name: posUser.name,
        email,
        auth_user_id: newUserId,
        status: "active",
        start_date: new Date().toISOString().split("T")[0],
      });
    }

    return json({
      success: true,
      message: `تم ربط حساب ${posUser.name} بنجاح وتفعيل صلاحيات الكاشير ✅`,
      auth_user_id: newUserId,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Idempotently ensure user has the 'cashier' role (preserves other roles)
async function ensureCashierRole(supabase: any, userId: string) {
  const { data: existing } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "cashier")
    .maybeSingle();
  if (!existing) {
    await supabase.from("user_roles").insert({ user_id: userId, role: "cashier" });
  }
}
