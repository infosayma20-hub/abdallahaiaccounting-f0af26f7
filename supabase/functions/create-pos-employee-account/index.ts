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

    const { pos_user_id, email, password, send_invite } = await req.json();

    if (!pos_user_id || !email || !password) {
      return json({ error: "بيانات ناقصة" }, 400);
    }

    if (password.length < 6) {
      return json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, 400);
    }

    // Get POS user
    const { data: posUser, error: puErr } = await supabase
      .from("pos_users")
      .select("id, name, company_id, has_account, auth_user_id, user_id")
      .eq("id", pos_user_id)
      .eq("user_id", userId)
      .single();

    if (puErr || !posUser) {
      return json({ error: "الموظف غير موجود" }, 404);
    }

    if (posUser.has_account && posUser.auth_user_id) {
      return json({ error: "هذا الموظف لديه حساب مسبقاً" }, 409);
    }

    // Get admin's company info
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("company_name, company_id")
      .eq("user_id", userId)
      .single();

    // Check if user with this email already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let newUserId: string;

    if (existingUser) {
      // User already exists - check if already linked to another POS user
      const { data: linkedPOS } = await supabase
        .from("pos_users")
        .select("id")
        .eq("auth_user_id", existingUser.id)
        .neq("id", pos_user_id)
        .maybeSingle();

      if (linkedPOS) {
        return json({ error: "هذا البريد مرتبط بموظف POS آخر" }, 409);
      }

      newUserId = existingUser.id;
    } else {
      // Create new auth user
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

      if (createErr || !newUser?.user) {
        return json({ error: createErr?.message || "فشل إنشاء الحساب" }, 400);
      }

      newUserId = newUser.user.id;
    }

    // Assign cashier role (in addition to employee role assigned by trigger)
    await supabase
      .from("user_roles")
      .insert({ user_id: newUserId, role: "cashier" })
      .select();

    // Ensure profile has invited_by and company_id set
    await supabase
      .from("profiles")
      .update({
        invited_by: userId,
        company_id: adminProfile?.company_id || null,
      })
      .eq("user_id", newUserId);

    // Update POS user with account link
    await supabase
      .from("pos_users")
      .update({
        has_account: true,
        auth_user_id: newUserId,
        account_status: "active",
        email,
      })
      .eq("id", pos_user_id);

    // Also create/link employee record if not exists
    const { data: existingEmp } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_user_id", newUserId)
      .single();

    if (!existingEmp) {
      await supabase.from("employees").insert({
        user_id: userId,
        full_name: posUser.name,
        email,
        auth_user_id: newUserId,
        status: "active",
        hire_date: new Date().toISOString().split("T")[0],
      });
    }

    return json({
      success: true,
      message: `تم إنشاء حساب ${posUser.name} بنجاح ✅`,
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
