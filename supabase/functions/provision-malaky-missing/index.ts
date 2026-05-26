import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_ID = "b4a221be-7b96-4952-8eb8-6ca749b46ca4";
const OWNER_USER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";

const EMPLOYEES = [
  { full_name: "امير الباشا", email: "ameeralbasha@malaky.com" },
  { full_name: "دانية مقبول", email: "daniamaqbool@malaky.com" },
  { full_name: "مالك كايد", email: "malekkayed@malaky.com" },
  { full_name: "ايسر مرشد", email: "ayssarmurshid@malaky.com" },
  { full_name: "اسلام ستيتيه", email: "islamstateih@malaky.com" },
  { full_name: "محمد نوري", email: "mohammadnouri@malaky.com" },
  { full_name: "بيدس عابد", email: "bedasabed@malaky.com" },
  { full_name: "يمان دار حمد الله", email: "yamandarhamdallah@malaky.com" },
  { full_name: "معتصم العبيات", email: "motasemobayat@malaky.com" },
  { full_name: "محمود عبد القادر", email: "mahmoudabdelqader@malaky.com" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: any[] = [];

  for (const emp of EMPLOYEES) {
    try {
      // 1. Create or find auth user
      let authId: string | null = null;
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email: emp.email,
        password: "123456",
        email_confirm: true,
        user_metadata: {
          full_name: emp.full_name,
          role: "employee",
          invited_by: OWNER_USER_ID,
          company_name: "شركة مطاعم الدجاج الملكي",
        },
      });

      if (created?.user) {
        authId = created.user.id;
      } else {
        // Likely already exists — look up by email
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = list?.users?.find((u) => u.email?.toLowerCase() === emp.email.toLowerCase());
        if (existing) {
          authId = existing.id;
          // Reset password to 123456 to be safe
          await supabase.auth.admin.updateUserById(authId, { password: "123456" });
        } else {
          results.push({ name: emp.full_name, email: emp.email, ok: false, error: cErr?.message || "no user" });
          continue;
        }
      }

      // Skip if employee row already exists for this auth_user_id
      const { data: existingEmp } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", authId)
        .maybeSingle();
      if (existingEmp) {
        results.push({ name: emp.full_name, email: emp.email, ok: true, employee_id: existingEmp.id, auth_id: authId, note: "already linked" });
        continue;
      }

      // 2. Create employee row
      const { data: empRow, error: eErr } = await supabase
        .from("employees")
        .insert({
          company_id: COMPANY_ID,
          user_id: OWNER_USER_ID,
          full_name: emp.full_name,
          email: emp.email,
          auth_user_id: authId,
          is_active: true,
          salary_type: "شهري",
        })
        .select("id")
        .single();

      if (eErr) {
        results.push({ name: emp.full_name, email: emp.email, ok: false, error: "employee insert: " + eErr.message, auth_id: authId });
        continue;
      }

      // 3. Assign employee role
      await supabase.from("user_roles").insert({ user_id: authId, role: "employee" });

      // 4. Ensure profile invited_by
      await supabase.from("profiles").update({ invited_by: OWNER_USER_ID }).eq("user_id", authId);

      results.push({ name: emp.full_name, email: emp.email, ok: true, employee_id: empRow.id, auth_id: authId });
    } catch (e) {
      results.push({ name: emp.full_name, email: emp.email, ok: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});