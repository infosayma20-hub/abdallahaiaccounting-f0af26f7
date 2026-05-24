import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  try {
    if (action === "login") {
      const { username, password, owner_id } = await req.json();
      
      // Get the user
      const { data: taskUser, error } = await supabaseAdmin
        .from("task_users")
        .select("*")
        .eq("user_id", owner_id)
        .eq("username", username.toLowerCase().trim())
        .eq("is_active", true)
        .single();

      if (error || !taskUser) {
        return new Response(JSON.stringify({ success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify password using pgcrypto
      const { data: match } = await supabaseAdmin.rpc("verify_task_password", {
        p_user_id: taskUser.id,
        p_password: password,
      });

      if (!match) {
        return new Response(JSON.stringify({ success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update last login
      await supabaseAdmin
        .from("task_users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", taskUser.id);

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: taskUser.id,
          full_name: taskUser.full_name,
          username: taskUser.username,
          role: taskUser.role,
          avatar_color: taskUser.avatar_color,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-user") {
      const auth = await authenticateRequest(req);
      if (auth instanceof Response) return auth;

      const { full_name, username, password, role, avatar_color } = await req.json();
      const ownerId = (await supabaseAdmin.rpc("get_team_owner_id", { _user_id: auth.userId })) as any;
      const ownerUid = ownerId?.data || auth.userId;

      // Hash password
      const { data, error } = await supabaseAdmin.rpc("create_task_user", {
        p_user_id: ownerUid,
        p_full_name: full_name,
        p_username: username.toLowerCase().trim(),
        p_password: password,
        p_role: role || "staff",
        p_avatar_color: avatar_color || "#1B3A5C",
      });

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "change-password") {
      const auth = await authenticateRequest(req);
      if (auth instanceof Response) return auth;

      const { task_user_id, new_password } = await req.json();

      // Resolve caller's owner id (team owner) and verify the task_user belongs to it
      const { data: ownerData } = await supabaseAdmin.rpc("get_team_owner_id", { _user_id: auth.userId });
      const ownerUid = (ownerData as string) || auth.userId;

      const { data: owned } = await supabaseAdmin.rpc("is_task_user_owned_by", {
        _task_user_id: task_user_id,
        _owner: ownerUid,
      });
      if (!owned) {
        return new Response(JSON.stringify({ success: false, error: "ليس لديك صلاحية" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data } = await supabaseAdmin.rpc("set_task_user_password", {
        p_task_user_id: task_user_id,
        p_new_password: new_password,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
