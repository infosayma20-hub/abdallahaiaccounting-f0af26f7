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

    const { prefix, count, password } = await req.json();
    const emailPrefix = prefix || "malakybroast";
    const totalCount = count || 50;
    const userPassword = password || "123456";

    if (userPassword.length < 3) {
      return json({ error: "كلمة المرور يجب أن تكون 3 أحرف على الأقل" }, 400);
    }

    // Get admin's company info
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("company_name, company_id")
      .eq("user_id", userId)
      .single();

    // Get POS company
    const { data: posCompany } = await supabase
      .from("pos_companies")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!posCompany) {
      return json({ error: "لا يوجد شركة POS مرتبطة بحسابك" }, 400);
    }

    const results: { email: string; status: string; error?: string }[] = [];

    for (let i = 1; i <= totalCount; i++) {
      const email = `${emailPrefix}${i}@gmail.com`;
      const name = email;

      try {
        // 1. Create auth user
        let authUserId: string;

        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: userPassword,
          email_confirm: true,
          user_metadata: {
            full_name: name,
            role: "employee",
            invited_by: userId,
            company_name: adminProfile?.company_name || "شركتي",
          },
        });

        if (createErr) {
          if (createErr.message?.includes("already been registered")) {
            // Find existing user
            const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const existingUser = usersData?.users?.find(
              (u) => u.email?.toLowerCase() === email.toLowerCase()
            );
            if (!existingUser) {
              results.push({ email, status: "error", error: "مسجل لكن غير موجود" });
              continue;
            }
            authUserId = existingUser.id;
          } else {
            results.push({ email, status: "error", error: createErr.message });
            continue;
          }
        } else if (!newUser?.user) {
          results.push({ email, status: "error", error: "فشل الإنشاء" });
          continue;
        } else {
          authUserId = newUser.user.id;
        }

        // 2. Clean up auto-assigned roles and assign ONLY cashier
        await supabase.from("user_roles").delete().eq("user_id", authUserId);
        await supabase.from("user_roles").insert({ user_id: authUserId, role: "cashier" });

        // 3. Ensure profile is linked to admin's team
        await supabase.from("profiles").update({
          invited_by: userId,
          company_id: adminProfile?.company_id || null,
          role: "cashier",
        }).eq("user_id", authUserId);

        // 4. Create POS user record if not exists
        const { data: existingPosUser } = await supabase
          .from("pos_users")
          .select("id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (!existingPosUser) {
          await supabase.from("pos_users").insert({
            user_id: userId,
            company_id: posCompany.id,
            name,
            email,
            pin_hash: "ACCOUNT_LOGIN",
            role: "cashier",
            has_account: true,
            auth_user_id: authUserId,
            account_status: "active",
            must_change_password: true,
          });
        } else {
          // Update existing
          await supabase.from("pos_users").update({
            has_account: true,
            auth_user_id: authUserId,
            account_status: "active",
            must_change_password: true,
          }).eq("id", existingPosUser.id);
        }

        // 5. Create employee record if not exists
        const { data: existingEmp } = await supabase
          .from("employees")
          .select("id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (!existingEmp) {
          await supabase.from("employees").insert({
            user_id: userId,
            full_name: name,
            email,
            auth_user_id: authUserId,
            status: "active",
            start_date: new Date().toISOString().split("T")[0],
          });
        }

        results.push({ email, status: "success" });
      } catch (err) {
        results.push({ email, status: "error", error: err.message });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    return json({
      success: true,
      message: `تم إنشاء ${successCount} موظف كاشير بنجاح ✅${errorCount > 0 ? ` (${errorCount} أخطاء)` : ""}`,
      total: totalCount,
      created: successCount,
      errors: errorCount,
      details: results,
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
