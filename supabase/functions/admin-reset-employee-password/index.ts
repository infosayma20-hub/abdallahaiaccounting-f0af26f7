import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity & role
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check role
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const roleList = (roles ?? []).map((r: any) => r.role);
    const allowed = roleList.some((r: string) =>
      ["admin", "hr_manager", "super_admin"].includes(r),
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { request_id, new_password, action, note } = body as {
      request_id: string;
      new_password?: string;
      action: "approve" | "reject";
      note?: string;
    };

    if (!request_id || !action) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch request
    const { data: reqRow, error: reqErr } = await admin
      .from("password_reset_requests")
      .select("*")
      .eq("id", request_id)
      .maybeSingle();
    if (reqErr || !reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reqRow.status !== "pending") {
      return new Response(JSON.stringify({ error: "Already resolved" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reject") {
      await admin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: caller.id,
          resolution_note: note ?? null,
        })
        .eq("id", request_id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // approve → set password
    if (!new_password || new_password.length < 8) {
      return new Response(
        JSON.stringify({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Lookup auth user by email (paginate — listUsers caps at perPage)
    const targetEmail = (reqRow.email ?? "").toLowerCase();
    let target: any = null;
    const perPage = 1000;
    for (let page = 1; page <= 50; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (listErr) throw listErr;
      target = list.users.find(
        (u) => (u.email ?? "").toLowerCase() === targetEmail,
      );
      if (target) break;
      if (!list.users.length || list.users.length < perPage) break;
    }
    if (!target) {
      return new Response(
        JSON.stringify({ error: "لم يتم العثور على المستخدم في النظام" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
      password: new_password,
      user_metadata: {
        ...(target.user_metadata ?? {}),
        must_change_password: true,
        password_reset_at: new Date().toISOString(),
      },
    });
    if (updErr) throw updErr;

    await admin
      .from("password_reset_requests")
      .update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolved_by: caller.id,
        resolution_note: note ?? null,
      })
      .eq("id", request_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});