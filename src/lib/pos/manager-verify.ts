/**
 * Safe manager-credential verification for POS sensitive actions.
 *
 * Uses a *throwaway* Supabase client so the cashier's authenticated session
 * on the main `supabase` client is NEVER swapped or invalidated.
 * Returns the manager identity + the list of branches they're allowed to manage.
 */
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type ManagerVerifyResult =
  | { ok: true; managerUserId: string; managerName: string; isAdmin: boolean; branchIds: string[] }
  | { ok: false; reason: string };

export async function verifyManagerCredentials(
  email: string,
  password: string,
): Promise<ManagerVerifyResult> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) {
    return { ok: false, reason: "أدخل البريد وكلمة المرور" };
  }

  // Throwaway client — never touches localStorage, never disturbs cashier session.
  const probe = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      } as any,
    },
  });

  try {
    const { data, error } = await probe.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error || !data.user) {
      return { ok: false, reason: "بيانات الدخول غير صحيحة" };
    }
    const managerUserId = data.user.id;

    // Use the MAIN authenticated client (cashier's session) to fetch roles/branches,
    // because RLS on user_roles / branch_manager_assignments / employees scopes by tenant.
    const [{ data: roles }, { data: assignments }, { data: profile }, { data: empRows }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", managerUserId),
      supabase
        .from("branch_manager_assignments")
        .select("branch_id")
        .eq("user_id", managerUserId),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", managerUserId)
        .maybeSingle(),
      // Employees flagged as "مدير فرع" (is_manager) count as branch managers
      // for their assigned branch — keeps Manager Mode in sync with the HR toggle.
      supabase
        .from("employees")
        .select("branch_id, is_manager, full_name")
        .or(`auth_user_id.eq.${managerUserId},user_id.eq.${managerUserId}`),
    ]);

    const isAdmin = (roles || []).some(
      (r: any) => r.role === "admin" || r.role === "super_admin",
    );
    const assignmentBranchIds = (assignments || []).map((a: any) => a.branch_id).filter(Boolean);
    const employeeBranchIds = (empRows || [])
      .filter((e: any) => e.is_manager && e.branch_id)
      .map((e: any) => e.branch_id);
    const branchIds = Array.from(new Set([...assignmentBranchIds, ...employeeBranchIds]));
    const employeeName = (empRows || []).find((e: any) => e.is_manager)?.full_name;

    if (!isAdmin && branchIds.length === 0) {
      // Sign out the throwaway just to be tidy
      try { await probe.auth.signOut(); } catch { /* ignore */ }
      return { ok: false, reason: "هذا الحساب ليس لديه صلاحية مدير" };
    }

    try { await probe.auth.signOut(); } catch { /* ignore */ }

    return {
      ok: true,
      managerUserId,
      managerName: profile?.display_name || employeeName || cleanEmail,
      isAdmin,
      branchIds,
    };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "حدث خطأ أثناء التحقق" };
  }
}