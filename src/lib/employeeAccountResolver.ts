import { supabase } from "@/integrations/supabase/client";

/**
 * يحدد حساب ذمم الموظف تحت 2180 عبر الربط الثابت employee_id فقط
 * (RPC ensure_employee_sub_account). لا بحث بالاسم ولا إنشاء حساب من الواجهة —
 * البحث بالاسم كان ينشئ حساباً مكرراً إذا اختلف الاسم المختصر عن الكامل.
 */
export async function resolveEmployeeSubAccount(ownerId: string, employeeId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc("ensure_employee_sub_account", {
    p_data_owner: ownerId,
    p_employee_id: employeeId,
  });
  if (error) throw new Error(error.message || "تعذر تحديد حساب ذمم الموظف");
  const code = Array.isArray(data) ? data[0]?.account_code : (data as any)?.account_code;
  if (!code) throw new Error("تعذر تحديد حساب ذمم الموظف");
  return String(code);
}
