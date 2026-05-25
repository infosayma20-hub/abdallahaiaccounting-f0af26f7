import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

/**
 * Syncs the cashier role onto an existing POS user's auth account.
 * Used after editing a POS user to make sure the user_roles table
 * actually grants POS access (the pos_users.role field is only a UI label).
 * Preserves other roles like 'employee' so dual employee+cashier accounts work.
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

    const { pos_user_id } = await req.json();
    if (!pos_user_id) return json({ error: "pos_user_id مطلوب" }, 400);

    const { data: posUser, error: puErr } = await supabase
      .from("pos_users")
      .select("id, name, auth_user_id, user_id")
      .eq("id", pos_user_id)
      .eq("user_id", userId)
      .single();

    if (puErr || !posUser) return json({ error: "الموظف غير موجود" }, 404);
    if (!posUser.auth_user_id) {
      return json({ success: true, message: "لا يوجد حساب مرتبط — لا حاجة للمزامنة", skipped: true });
    }

    // Idempotent: insert cashier role only if missing; never touch other roles.
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", posUser.auth_user_id)
      .eq("role", "cashier")
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: posUser.auth_user_id, role: "cashier" });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    return json({
      success: true,
      message: `تم تأكيد صلاحية الكاشير لـ ${posUser.name}`,
      added: !existing,
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