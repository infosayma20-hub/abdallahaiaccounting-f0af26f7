import { supabase } from "@/integrations/supabase/client";

/**
 * يختار رقم حساب موجود فعلاً بدليل حسابات المستخدم.
 * دليلا الحسابات بالنظام مختلفان (مثلاً مردود المبيعات 4150 بقالب و4400 بآخر)،
 * فالترقيم الثابت كان يسجّل قيوداً على حسابات غير موجودة لا تظهر بالكشوفات.
 * الترتيب: حساب موسوم بـ system_role أولاً، ثم أول رقم موجود من المرشّحين.
 */
export async function pickTenantAccountCode(
  ownerId: string,
  candidates: string[],
  systemRole?: string,
): Promise<string> {
  const { data } = await supabase
    .from("accounts")
    .select("account_code, system_role")
    .eq("user_id", ownerId)
    .or(
      [
        `account_code.in.(${candidates.join(",")})`,
        systemRole ? `system_role.eq.${systemRole}` : null,
      ].filter(Boolean).join(","),
    );
  const rows = (data || []) as Array<{ account_code: string; system_role: string | null }>;
  const byRole = systemRole ? rows.find(r => r.system_role === systemRole) : undefined;
  if (byRole) return byRole.account_code;
  const found = candidates.find(c => rows.some(r => r.account_code === c));
  if (found) return found;
  throw new Error(`الحساب المطلوب غير موجود بدليل الحسابات (${candidates.join(" / ")})`);
}

export const OPENING_BALANCE_CODES = ["3110", "3400"];
