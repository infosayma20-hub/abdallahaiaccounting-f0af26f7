import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !adminUser) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: adminUser.id,
      _role: "admin",
    });
    const { data: hasSuperAdmin } = await supabase.rpc("is_super_admin", {
      _user_id: adminUser.id,
    });
    if (!hasAdmin && !hasSuperAdmin) {
      return new Response(JSON.stringify({ error: "ليس لديك صلاحية" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { full_name, email, password, role } = body;
      if (!full_name || !email || !password || !role) {
        return new Response(JSON.stringify({ error: "البيانات ناقصة" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get admin's company info
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("company_id, company_name")
        .eq("user_id", adminUser.id)
        .single();

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
          invited_by: adminUser.id,
          company_name: adminProfile?.company_name || "شركتي",
        },
      });

      if (createErr || !newUser?.user) {
        return new Response(JSON.stringify({ error: createErr?.message || "فشل الإنشاء" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUserId = newUser.user.id;

      // Update profile with company_id and role
      await supabase
        .from("profiles")
        .update({
          invited_by: adminUser.id,
          company_id: adminProfile?.company_id,
          role,
        })
        .eq("user_id", newUserId);

      // Assign role (remove default admin, add requested role)
      await supabase.from("user_roles").delete().eq("user_id", newUserId);
      await supabase.from("user_roles").insert({ user_id: newUserId, role });

      // Log activity
      await supabase.from("activity_log").insert({
        user_id: adminUser.id,
        actor_id: adminUser.id,
        actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
        action: "create_user",
        entity_type: "user",
        entity_id: newUserId,
        entity_label: full_name,
        details: { email, role },
      });

      return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_active") {
      const { target_user_id, is_active } = body;

      if (is_active) {
        // Unban user
        await supabase.auth.admin.updateUserById(target_user_id, { ban_duration: "none" });
      } else {
        // Ban user (effectively deactivate)
        await supabase.auth.admin.updateUserById(target_user_id, { ban_duration: "876000h" }); // 100 years
      }

      await supabase.from("activity_log").insert({
        user_id: adminUser.id,
        actor_id: adminUser.id,
        actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
        action: is_active ? "activate_user" : "deactivate_user",
        entity_type: "user",
        entity_id: target_user_id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const email = String(body.email || "").toLowerCase().trim();
      const newPassword = String(body.new_password || "");
      if (!email || !newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "البريد أو كلمة المرور غير صالحة (6 أحرف على الأقل)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let targetUser = null;
      for (let page = 1; page <= 20 && !targetUser; page++) {
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) throw listError;
        targetUser = listData.users.find((u) => u.email?.toLowerCase() === email) ?? null;
        if (listData.users.length < 1000) break;
      }
      if (!targetUser) {
        return new Response(JSON.stringify({ error: "لم يتم العثور على مستخدم بهذا البريد" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!hasSuperAdmin) {
        const [{ data: adminProfile }, { data: targetProfile }, { data: targetIsAdmin }] = await Promise.all([
          supabase.from("profiles").select("company_id").eq("user_id", adminUser.id).maybeSingle(),
          supabase.from("profiles").select("user_id, invited_by, company_id").eq("user_id", targetUser.id).maybeSingle(),
          supabase.rpc("has_role", { _user_id: targetUser.id, _role: "admin" }),
        ]);

        const sameCompany = !!adminProfile?.company_id && adminProfile.company_id === targetProfile?.company_id;
        const invitedByAdmin = targetProfile?.invited_by === adminUser.id;
        const isSelf = targetUser.id === adminUser.id;
        if (!targetProfile || targetIsAdmin || (!isSelf && !invitedByAdmin && !sameCompany)) {
          return new Response(JSON.stringify({ error: "ليس لديك صلاحية لتغيير كلمة مرور هذا المستخدم" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error } = await supabase.auth.admin.updateUserById(targetUser.id, { password: newPassword });
      if (error) throw error;

      await supabase.from("activity_log").insert({
        user_id: adminUser.id,
        actor_id: adminUser.id,
        actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
        action: "reset_password",
        entity_type: "user",
        entity_id: targetUser.id,
        details: { email },
      });

      return new Response(JSON.stringify({ success: true, user_id: targetUser.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password_by_id") {
      const targetUserId = String(body.target_user_id || "");
      const newPassword = String(body.new_password || "");
      if (!targetUserId || !newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "المعرف أو كلمة المرور غير صالحة (6 أحرف على الأقل)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cross-tenant verification (even super admin must pass the explicit check; super admin bypass kept for self-service paths only)
      const [{ data: adminProfile }, { data: targetProfile }, { data: targetIsAdminRole }] = await Promise.all([
        supabase.from("profiles").select("user_id, company_id").eq("user_id", adminUser.id).maybeSingle(),
        supabase.from("profiles").select("user_id, invited_by, company_id, display_name").eq("user_id", targetUserId).maybeSingle(),
        supabase.rpc("has_role", { _user_id: targetUserId, _role: "admin" }),
      ]);

      if (!targetProfile) {
        await supabase.from("activity_log").insert({
          user_id: adminUser.id, actor_id: adminUser.id,
          actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
          action: "reset_password_denied", entity_type: "user", entity_id: targetUserId,
          details: { reason: "target_not_found" },
        });
        return new Response(JSON.stringify({ error: "المستخدم غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isSelf = targetUserId === adminUser.id;
      const sameCompany = !!adminProfile?.company_id && adminProfile.company_id === targetProfile?.company_id;
      const invitedByAdmin = targetProfile?.invited_by === adminUser.id;
      const allowed = hasSuperAdmin || isSelf || invitedByAdmin || (sameCompany && !targetIsAdminRole);

      if (!allowed) {
        await supabase.from("activity_log").insert({
          user_id: adminUser.id, actor_id: adminUser.id,
          actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
          action: "reset_password_denied", entity_type: "user", entity_id: targetUserId,
          details: {
            reason: "cross_tenant_forbidden",
            actor_company_id: adminProfile?.company_id ?? null,
            target_company_id: targetProfile?.company_id ?? null,
          },
        });
        return new Response(JSON.stringify({ error: "403 Cross-tenant forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.auth.admin.updateUserById(targetUserId, { password: newPassword });
      if (error) throw error;

      await supabase.from("activity_log").insert({
        user_id: adminUser.id, actor_id: adminUser.id,
        actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
        action: "reset_password", entity_type: "user", entity_id: targetUserId,
        entity_label: targetProfile.display_name || null,
        details: { method: "by_id", company_id: adminProfile?.company_id ?? null },
      });

      return new Response(JSON.stringify({ success: true, user_id: targetUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "change_role") {
      const { target_user_id, new_role } = body;

      await supabase.from("user_roles").delete().eq("user_id", target_user_id);
      await supabase.from("user_roles").insert({ user_id: target_user_id, role: new_role });
      await supabase.from("profiles").update({ role: new_role }).eq("user_id", target_user_id);

      await supabase.from("activity_log").insert({
        user_id: adminUser.id,
        actor_id: adminUser.id,
        actor_name: adminUser.user_metadata?.full_name || adminUser.email || "",
        action: "change_role",
        entity_type: "user",
        entity_id: target_user_id,
        details: { new_role },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
