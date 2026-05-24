import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "login") {
      const { data, error } = await supabase.rpc("verify_malaki_login", {
        p_username: body.username || body.email,
        p_password: body.password,
      });
      if (error) throw error;
      return respond(data);
    }

    // ── All other actions require an authenticated admin/super_admin caller ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ success: false, error: "غير مصرح" }, 401);
    }
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !caller) {
      return respond({ success: false, error: "غير مصرح" }, 401);
    }

    const [{ data: hasAdmin }, { data: hasSuperAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" }),
      supabase.rpc("is_super_admin", { _user_id: caller.id }),
    ]);
    if (!hasAdmin && !hasSuperAdmin) {
      return respond({ success: false, error: "ليس لديك صلاحية" }, 403);
    }

    // Tenant guard: force user_id / admin_user_id scoping to the caller's owner id.
    const { data: callerOwnerId } = await supabase.rpc("get_team_owner_id", { _user_id: caller.id });
    const ownerScope: string = callerOwnerId || caller.id;
    if (!hasSuperAdmin) {
      // For list_users, force the user_id filter to the caller's tenant
      if (action === "list_users") {
        body.user_id = ownerScope;
      }
      // For create / link, force admin_user_id / user_id to caller's tenant
      if (action === "create_user" || action === "link_existing_user") {
        body.user_id = ownerScope;
        body.admin_user_id = ownerScope;
      }
      // For update/delete/reset_password, verify target portal user belongs to caller's tenant
      if (action === "update_user" || action === "delete_user" || action === "reset_password") {
        const { data: target } = await supabase
          .from("malaki_portal_users")
          .select("user_id")
          .eq("id", body.user_id)
          .maybeSingle();
        if (!target || target.user_id !== ownerScope) {
          return respond({ success: false, error: "ليس لديك صلاحية على هذا المستخدم" }, 403);
        }
      }
    }

    if (action === "list_users") {
      let query = supabase
        .from("malaki_portal_users")
        .select("id, username, email, full_name, role, can_see_sales, can_see_liquidity, can_see_all_branches, last_login, is_active, created_at, user_id, auth_user_id")
        .order("created_at");
      
      if (body.user_id) {
        query = query.eq("user_id", body.user_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return respond({ success: true, users: data });
    }

    // Link an existing portal user to a new Supabase Auth account
    if (action === "link_existing_user") {
      const portalUserId = body.portal_user_id;
      const email = (body.email || "").toLowerCase().trim();
      const password = body.password;
      const fullName = body.full_name;
      const adminUserId = body.admin_user_id || null;

      // Create Supabase Auth account
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: 'portal', invited_by: adminUserId },
      });
      if (authError) throw authError;

      const authUserId = authData.user.id;

      // Assign portal role
      await supabase.from("user_roles").insert({ user_id: authUserId, role: "portal" }).throwOnError();

      // Link auth_user_id to existing portal user
      await supabase.from("malaki_portal_users")
        .update({ auth_user_id: authUserId, email, user_id: adminUserId })
        .eq("id", portalUserId);

      // Create profile
      let adminCompanyId = null;
      if (adminUserId) {
        const { data: ap } = await supabase.from("profiles").select("company_id").eq("user_id", adminUserId).single();
        adminCompanyId = ap?.company_id;
      }
      await supabase.from("profiles").upsert({
        user_id: authUserId, display_name: fullName, role: "portal", invited_by: adminUserId, company_id: adminCompanyId,
      }, { onConflict: "user_id" });

      // Safety — remove any 'admin' role that may have been auto-assigned by trigger
      await supabase.from("user_roles").delete().eq("user_id", authUserId).eq("role", "admin");

      return respond({ success: true });
    }

    if (action === "create_user") {
      const email = (body.email || body.username || "").toLowerCase().trim();
      const password = body.password;
      const fullName = body.full_name;
      const adminUserId = body.user_id || null;

      // Step 1: Create a real Supabase Auth account
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'portal',
          invited_by: adminUserId,
        },
      });

      if (authError) {
        if (authError.message?.includes("already been registered")) {
          return respond({ success: false, error: "البريد الإلكتروني موجود مسبقاً" });
        }
        throw authError;
      }

      const authUserId = authData.user.id;

      // Step 2: Assign 'portal' role in user_roles
      await supabase.from("user_roles").insert({
        user_id: authUserId,
        role: "portal",
      }).throwOnError();

      // Step 3: Create portal permissions entry in malaki_portal_users
      const { data: portalData, error: portalError } = await supabase.rpc("malaki_create_user", {
        p_username: email,
        p_password: password,
        p_full_name: fullName,
        p_role: body.role || "viewer",
        p_can_see_sales: body.can_see_sales ?? true,
        p_can_see_liquidity: body.can_see_liquidity ?? true,
        p_can_see_all_branches: body.can_see_all_branches ?? true,
        p_user_id: adminUserId,
      });

      if (portalError) {
        // Cleanup: delete the auth user if portal entry fails
        await supabase.auth.admin.deleteUser(authUserId);
        throw portalError;
      }

      // Step 4: Link auth_user_id and email to portal user
      if (portalData?.id) {
        await supabase.from("malaki_portal_users")
          .update({ auth_user_id: authUserId, email: email })
          .eq("id", portalData.id);
      }

      // Step 5: Create a profile for the portal user linked to admin's company
      let adminCompanyId = null;
      if (adminUserId) {
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", adminUserId)
          .single();
        adminCompanyId = adminProfile?.company_id;
      }

      await supabase.from("profiles").upsert({
        user_id: authUserId,
        display_name: fullName,
        role: "portal",
        invited_by: adminUserId,
        company_id: adminCompanyId,
      }, { onConflict: "user_id" });

      // Step 6: Safety — remove any 'admin' role that may have been auto-assigned by trigger
      await supabase.from("user_roles").delete().eq("user_id", authUserId).eq("role", "admin");

      return respond({ success: true, id: portalData?.id });
    }

    if (action === "update_user") {
      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name;
      if (body.role !== undefined) updates.role = body.role;
      if (body.is_active !== undefined) updates.is_active = body.is_active;
      if (body.can_see_sales !== undefined) updates.can_see_sales = body.can_see_sales;
      if (body.can_see_liquidity !== undefined) updates.can_see_liquidity = body.can_see_liquidity;
      if (body.can_see_all_branches !== undefined) updates.can_see_all_branches = body.can_see_all_branches;

      const { error } = await supabase
        .from("malaki_portal_users")
        .update(updates)
        .eq("id", body.user_id);
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === "delete_user") {
      // Get the auth_user_id before deleting
      const { data: portalUser } = await supabase
        .from("malaki_portal_users")
        .select("auth_user_id")
        .eq("id", body.user_id)
        .single();

      // Delete portal user entry
      const { error } = await supabase
        .from("malaki_portal_users")
        .delete()
        .eq("id", body.user_id);
      if (error) throw error;

      // Also delete the Supabase Auth account if linked
      if (portalUser?.auth_user_id) {
        await supabase.auth.admin.deleteUser(portalUser.auth_user_id);
      }

      return respond({ success: true });
    }

    if (action === "reset_password") {
      // Reset password in malaki_portal_users (legacy)
      const { data, error } = await supabase.rpc("malaki_set_password", {
        p_user_id: body.user_id,
        p_new_password: body.new_password,
      });
      if (error) throw error;

      // Also update Supabase Auth password if linked
      const { data: portalUser } = await supabase
        .from("malaki_portal_users")
        .select("auth_user_id")
        .eq("id", body.user_id)
        .single();

      if (portalUser?.auth_user_id) {
        await supabase.auth.admin.updateUserById(portalUser.auth_user_id, {
          password: body.new_password,
        });
      }

      return respond({ success: data });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond({ success: false, error: message }, 500);
  }
});
