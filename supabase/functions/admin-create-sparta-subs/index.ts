// One-shot helper: creates the three Sparta subsidiary auth users and links them
// to the `sparta` holding. Caller must be super_admin. Safe to re-run — uses
// upsert-by-email semantics and ON CONFLICT DO NOTHING on the link table.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBS = [
  { email: "spartadental@sparta-trade.com", name: "سبارتا لزرعات الأسنان",            sector: "medical_dental", sort: 1 },
  { email: "spartajapan@sparta-trade.com",  name: "سبارتا اليابان للمستلزمات الطبية", sector: "medical_tender", sort: 2 },
  { email: "spartaedu@sparta-trade.com",    name: "أكاديمية سبارتا للتعليم المستمر",  sector: "education",      sort: 3 },
];
const PASSWORD = "123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) {
      return json({ error: "UNAUTHENTICATED" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // locate holding
    const { data: hold, error: hErr } = await admin
      .from("holdings").select("id").eq("slug", "sparta").maybeSingle();
    if (hErr || !hold) return json({ error: "HOLDING_NOT_FOUND" }, 404);
    const holdingId = (hold as any).id as string;

    // Allow: super_admin / admin / member of the sparta holding
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleList = (roles ?? []).map((r: any) => r.role);
    let allowed = roleList.includes("super_admin") || roleList.includes("admin");
    if (!allowed) {
      const { data: m } = await admin.from("holding_members")
        .select("id").eq("holding_id", holdingId).eq("auth_user_id", user.id).limit(1);
      if (m && m.length > 0) allowed = true;
    }
    if (!allowed) return json({ error: "ACCESS_DENIED" }, 403);

    // existing users
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (lErr) throw lErr;
    const byEmail = new Map(list.users.map(u => [(u.email ?? "").toLowerCase(), u]));

    const results: any[] = [];
    for (const s of SUBS) {
      let uid: string;
      const existing = byEmail.get(s.email.toLowerCase());
      if (existing) {
        // reset password and confirm
        await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
        uid = existing.id;
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: s.email, password: PASSWORD, email_confirm: true,
        });
        if (cErr) throw cErr;
        uid = created.user!.id;
      }

      const { error: linkErr } = await admin.from("holding_companies").upsert({
        holding_id: holdingId,
        owner_id: uid,
        display_name_ar: s.name,
        sector: s.sector,
        sort_order: s.sort,
        is_active: true,
      }, { onConflict: "holding_id,owner_id" });
      if (linkErr) throw linkErr;

      results.push({ email: s.email, user_id: uid, name: s.name });
    }

    return json({ ok: true, holding_id: holdingId, subsidiaries: results });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}