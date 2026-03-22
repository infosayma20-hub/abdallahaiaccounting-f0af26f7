import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAFF_LIST = [
  { name: "احمد ابو صلاح", username: "ahmedabusalah", dept: "كاش" },
  { name: "احمد طوقان", username: "ahmedtouqan", dept: "كاش" },
  { name: "ادهم ياسين", username: "adhamyaseen", dept: "كاش" },
  { name: "ايمان جعفر", username: "emanjafar", dept: "كاش" },
  { name: "تالا حميض", username: "talahmeed", dept: "كاش" },
  { name: "ترتيل دنديس", username: "tartieldandees", dept: "كاش" },
  { name: "حنين القيسي", username: "haneenalqaisi", dept: "كاش" },
  { name: "عاصم مخلوف", username: "asemmakhlouf", dept: "كاش" },
  { name: "عبادة اشتية", username: "obadashtieh", dept: "كاش" },
  { name: "عمران رداد", username: "omranraddad", dept: "كاش" },
  { name: "فراس الشريف", username: "ferasalsharif", dept: "كاش" },
  { name: "لين الشيخ عبد الله", username: "leenalsheikh", dept: "كاش" },
  { name: "مراد ابو غضيب", username: "muradabughdaib", dept: "كاش" },
  { name: "ميسم يحيى", username: "maysamyahya", dept: "كاش" },
  { name: "اية دنديس", username: "ayadandees", dept: "كول سنتر" },
  { name: "هالة حسون", username: "halahassoun", dept: "كول سنتر" },
  { name: "هيا صوصة", username: "hayasawsa", dept: "كول سنتر" },
  { name: "يسرى ادعيس", username: "yosraadais", dept: "كول سنتر" },
];

const PASSWORD = "123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Use admin user ID directly (one-time setup function)
    const userId = "397b9cfb-d408-4324-88b8-c5a8943a6ac5";

    // Get admin profile and POS company
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("company_name, company_id")
      .eq("user_id", userId)
      .single();

    const { data: posCompany } = await supabase
      .from("pos_companies")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!posCompany) return json({ error: "لا يوجد شركة POS" }, 400);

    const results: any[] = [];

    for (const staff of STAFF_LIST) {
      const cashierEmail = `${staff.username}@malakysales.com`;
      const employeeEmail = `${staff.username}@malaky.com`;
      const result: any = { name: staff.name, dept: staff.dept, cashierEmail, employeeEmail };

      try {
        // ===== 1. CASHIER (POS) ACCOUNT =====
        let cashierAuthId: string | null = null;
        
        const { data: newCashier, error: cashierErr } = await supabase.auth.admin.createUser({
          email: cashierEmail,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: staff.name,
            role: "employee",
            invited_by: userId,
            company_name: adminProfile?.company_name || "شركتي",
          },
        });

        if (cashierErr) {
          if (cashierErr.message?.includes("already been registered")) {
            const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const existing = usersData?.users?.find(u => u.email?.toLowerCase() === cashierEmail.toLowerCase());
            if (existing) {
              cashierAuthId = existing.id;
              await supabase.auth.admin.updateUserById(existing.id, { password: PASSWORD });
              result.cashierStatus = "exists_updated";
            } else {
              result.cashierStatus = "error";
              result.cashierError = "مسجل لكن غير موجود";
            }
          } else {
            result.cashierStatus = "error";
            result.cashierError = cashierErr.message;
          }
        } else {
          cashierAuthId = newCashier?.user?.id || null;
          result.cashierStatus = "created";
        }

        if (cashierAuthId) {
          // Assign cashier role ONLY
          await supabase.from("user_roles").delete().eq("user_id", cashierAuthId);
          await supabase.from("user_roles").insert({ user_id: cashierAuthId, role: "cashier" });

          // Update profile
          await supabase.from("profiles").update({
            invited_by: userId,
            company_id: adminProfile?.company_id || null,
            role: "cashier",
          }).eq("user_id", cashierAuthId);

          // Create/update POS user - NO must_change_password
          const { data: existingPosUser } = await supabase
            .from("pos_users")
            .select("id")
            .eq("auth_user_id", cashierAuthId)
            .maybeSingle();

          if (!existingPosUser) {
            await supabase.from("pos_users").insert({
              user_id: userId,
              company_id: posCompany.id,
              name: staff.name,
              email: cashierEmail,
              pin_hash: "ACCOUNT_LOGIN",
              role: "cashier",
              has_account: true,
              auth_user_id: cashierAuthId,
              account_status: "active",
              must_change_password: false,
            });
          } else {
            await supabase.from("pos_users").update({
              name: staff.name,
              has_account: true,
              auth_user_id: cashierAuthId,
              account_status: "active",
              must_change_password: false,
            }).eq("id", existingPosUser.id);
          }
        }

        // ===== 2. EMPLOYEE ACCOUNT =====
        const { data: empRecord } = await supabase
          .from("employees")
          .select("id, auth_user_id")
          .eq("full_name", staff.name)
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (!empRecord) {
          result.employeeStatus = "no_employee_record";
          results.push(result);
          continue;
        }

        let empAuthId: string | null = empRecord.auth_user_id;

        if (!empAuthId) {
          const { data: newEmp, error: empErr } = await supabase.auth.admin.createUser({
            email: employeeEmail,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: {
              full_name: staff.name,
              role: "employee",
              invited_by: userId,
              company_name: adminProfile?.company_name || "شركتي",
            },
          });

          if (empErr) {
            if (empErr.message?.includes("already been registered")) {
              const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
              const existing = usersData?.users?.find(u => u.email?.toLowerCase() === employeeEmail.toLowerCase());
              if (existing) {
                empAuthId = existing.id;
                await supabase.auth.admin.updateUserById(existing.id, { password: PASSWORD });
                result.employeeStatus = "exists_updated";
              } else {
                result.employeeStatus = "error";
                result.employeeError = empErr.message;
              }
            } else {
              result.employeeStatus = "error";
              result.employeeError = empErr.message;
            }
          } else {
            empAuthId = newEmp?.user?.id || null;
            result.employeeStatus = "created";
          }

          if (empAuthId) {
            await supabase.from("employees").update({
              auth_user_id: empAuthId,
              email: employeeEmail,
            }).eq("id", empRecord.id);

            await supabase.from("user_roles").delete().eq("user_id", empAuthId);
            await supabase.from("user_roles").insert({ user_id: empAuthId, role: "employee" });

            await supabase.from("profiles").update({
              invited_by: userId,
              company_id: adminProfile?.company_id || null,
              role: "employee",
            }).eq("user_id", empAuthId);
          }
        } else {
          await supabase.auth.admin.updateUserById(empAuthId, { 
            email: employeeEmail,
            password: PASSWORD,
          });
          await supabase.from("employees").update({ email: employeeEmail }).eq("id", empRecord.id);
          result.employeeStatus = "updated_existing";
        }

        results.push(result);
      } catch (err) {
        result.error = err.message;
        results.push(result);
      }
    }

    // ===== 3. DISABLE must_change_password FOR ALL POS USERS =====
    await supabase.from("pos_users")
      .update({ must_change_password: false })
      .eq("user_id", userId);

    const cashierCreated = results.filter(r => r.cashierStatus === "created").length;
    const empCreated = results.filter(r => r.employeeStatus === "created").length;

    return json({
      success: true,
      message: `تم إنشاء ${cashierCreated} حساب كاشير و ${empCreated} حساب موظف ✅ | تم إلغاء سياسة تغيير كلمة المرور`,
      total: STAFF_LIST.length,
      results,
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
