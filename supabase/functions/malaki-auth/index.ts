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

    if (action === "list_users") {
      let query = supabase
        .from("malaki_portal_users")
        .select("id, username, email, full_name, role, can_see_sales, can_see_liquidity, can_see_all_branches, last_login, is_active, created_at, user_id")
        .order("created_at");
      
      // Filter by user_id if provided
      if (body.user_id) {
        query = query.eq("user_id", body.user_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return respond({ success: true, users: data });
    }

    if (action === "create_user") {
      // Use email as username if no separate username provided
      const username = body.username || body.email;
      const { data, error } = await supabase.rpc("malaki_create_user", {
        p_username: username,
        p_password: body.password,
        p_full_name: body.full_name,
        p_role: body.role || "viewer",
        p_can_see_sales: body.can_see_sales ?? true,
        p_can_see_liquidity: body.can_see_liquidity ?? true,
        p_can_see_all_branches: body.can_see_all_branches ?? true,
        p_user_id: body.user_id || null,
      });
      if (error) throw error;
      // Save email
      if (body.email && data?.id) {
        await supabase.from("malaki_portal_users").update({ email: body.email.toLowerCase().trim() }).eq("id", data.id);
      }
      return respond(data);
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
      const { error } = await supabase
        .from("malaki_portal_users")
        .delete()
        .eq("id", body.user_id);
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === "reset_password") {
      const { data, error } = await supabase.rpc("malaki_set_password", {
        p_user_id: body.user_id,
        p_new_password: body.new_password,
      });
      if (error) throw error;
      return respond({ success: data });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond({ success: false, error: message }, 500);
  }
});
