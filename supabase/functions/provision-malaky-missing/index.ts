import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_ID = "b4a221be-7b96-4952-8eb8-6ca749b46ca4";
const OWNER_USER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";

const EMPLOYEES = [
  { full_name: "امير الباشا", email: "ameeralbasha@malaky.com", existing_auth_id: "14db9133-484f-4fca-829c-780070410f2e" },
  { full_name: "دانية مقبول", email: "daniamaqbool@malaky.com", existing_auth_id: "11bf92e6-d693-446c-9b36-1b66a67d1a23" },
  { full_name: "مالك كايد", email: "malekkayed@malaky.com", existing_auth_id: "6b64352e-c197-4946-896a-6eb98a80d9e0" },
  { full_name: "ايسر مرشد", email: "ayssarmurshid@malaky.com", existing_auth_id: "f3c1fa0a-f7b0-49ec-9f8b-03254957f965" },
  { full_name: "اسلام ستيتيه", email: "islamstateih@malaky.com", existing_auth_id: "2e265737-a153-4f25-b3c8-b3eae2625f3f" },
  { full_name: "محمد نوري", email: "mohammadnouri@malaky.com", existing_auth_id: "836b6a4f-b5cf-472e-bff2-d79260b551d8" },
  { full_name: "بيدس عابد", email: "bedasabed@malaky.com", existing_auth_id: "cf4a61f1-fde3-4d8a-a216-0485157df7e5" },
  { full_name: "يمان دار حمد الله", email: "yamandarhamdallah@malaky.com", existing_auth_id: "b0530fd3-1ffe-4f2e-8b70-b3fbafb2b872" },
  { full_name: "معتصم العبيات", email: "motasemobayat@malaky.com", existing_auth_id: "73081326-8dd0-4d56-8359-17f632f21ef2" },
  { full_name: "محمود عبد القادر", email: "mahmoudabdelqader@malaky.com", existing_auth_id: "78ea211b-d17b-4e2a-b8aa-d0f2ad11cf65" },
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
      // 1. Use known existing auth user (created in prior run)
      const authId = emp.existing_auth_id;
      await supabase.auth.admin.updateUserById(authId, { password: "123456" });

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