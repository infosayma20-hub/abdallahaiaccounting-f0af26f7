import { supabase } from "@/integrations/supabase/client";
import { isAuthSessionExpiredError, redirectToSessionExpired } from "@/lib/sessionExpired";

/**
 * Reads owner-onboarding completion for a given user.
 * Returns:
 *  - "na"         → the user is not an "owner-like" account (employee, cashier, portal, super_admin, sales_rep, feedback-only).
 *                   No onboarding gate should be applied; their dedicated screen is the destination.
 *  - "incomplete" → owner-like AND company_profiles.onboarding_completed is false (or company/profile missing).
 *  - "completed"  → owner-like AND onboarding_completed is true.
 */
export type OnboardingStatus = "na" | "incomplete" | "completed";

const assertQueryOk = <T,>(result: { data: T; error: unknown }): T => {
  if (result.error) {
    if (isAuthSessionExpiredError(result.error)) redirectToSessionExpired();
    throw result.error;
  }
  return result.data;
};

async function checkFeedbackOnly(userId: string): Promise<boolean> {
  const data = assertQueryOk(await supabase
    .from("user_feature_permissions")
    .select("id")
    .eq("target_user_id", userId)
    .eq("app_key", "call_center_feedback")
    .eq("access_state", "allow")
    .limit(1));
  return !!(data && data.length > 0);
}

async function readOwnerOnboardingCompleted(userId: string): Promise<boolean | null> {
  const ownerIdData = assertQueryOk(await supabase.rpc("get_team_owner_id", { _user_id: userId }));
  const ownerId = (ownerIdData as string | null) || userId;
  const company = assertQueryOk(await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle());
  if (!company) {
    // No `companies` row but the tenant may still be an established legacy
    // user (chart of accounts seeded, invoices, employees, contacts). Don't
    // force them into the wizard.
    const { count: accountsCount, error: accountsError } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ownerId);
    if (accountsError) {
      if (isAuthSessionExpiredError(accountsError)) redirectToSessionExpired();
      throw accountsError;
    }
    if ((accountsCount ?? 0) > 5) return true;
    return false; // truly new → must onboard
  }
  const profile = assertQueryOk(await supabase
    .from("company_profiles")
    .select("onboarding_completed")
    .eq("company_id", company.id)
    .maybeSingle());
  if (profile?.onboarding_completed) return true;
  // Fallback for legacy tenants who own a company but never went through the
  // 6-step wizard: if they already have substantive data, treat as completed
  // so the gate doesn't loop them back to /onboarding.
  if (!profile) {
    const { count: accountsCount, error: accountsError } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ownerId);
    if (accountsError) {
      if (isAuthSessionExpiredError(accountsError)) redirectToSessionExpired();
      throw accountsError;
    }
    if ((accountsCount ?? 0) > 5) return true;
  }
  return false;
}

export async function fetchOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  try {
    const [rolesResult, empResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("employees")
        .select("id, is_active, is_terminated")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);
    const rolesData = assertQueryOk(rolesResult);
    const emp = assertQueryOk(empResult);
    const roles = (rolesData || []).map((r) => String(r.role));
    const hasAdminAccess = roles.some(
      (r) => r === "admin" || r === "hr_manager" || r.startsWith("accountant")
    );
    // System / portal-only roles → no gate.
    if (roles.includes("super_admin")) return "na";
    if (roles.includes("portal") && !roles.includes("admin")) return "na";
    if (roles.includes("store_tracker") && !roles.includes("admin")) return "na";
    if (roles.includes("worker") && roles.length === 1) return "na";
    if (roles.includes("sales_rep") && !hasAdminAccess) return "na";
    if (roles.includes("cashier") && !roles.includes("admin")) return "na";
    if (roles.includes("employee") && !hasAdminAccess) return "na";

    const isEmployee = !!emp && emp.is_active && !emp.is_terminated;
    if (isEmployee && !hasAdminAccess) return "na";

    // Feedback-only invited user (no admin, no employee) → /feedback handles its own access.
    if (!hasAdminAccess && !isEmployee) {
      const fb = await checkFeedbackOnly(userId);
      if (fb) return "na";
    }

    const completed = await readOwnerOnboardingCompleted(userId);
    return completed ? "completed" : "incomplete";
  } catch {
    return "na"; // fail open — never block on transient errors
  }
}

/**
 * One-shot destination resolver used after auth verify (OTP).
 * Mirrors the priority order used by useRoleRedirect, plus the
 * owner-onboarding check so new owners land on /onboarding and
 * returning owners land on /apps.
 */
export async function resolvePostSignupDestination(userId: string): Promise<string> {
  try {
    const [rolesResult, empResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("employees")
        .select("id, is_active, is_terminated")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);
    const rolesData = assertQueryOk(rolesResult);
    const emp = assertQueryOk(empResult);
    const roles = (rolesData || []).map((r) => String(r.role));
    const hasAdminAccess = roles.some(
      (r) => r === "admin" || r === "super_admin" || r === "hr_manager" || r.startsWith("accountant")
    );
    const isEmployee = !!emp && emp.is_active && !emp.is_terminated;

    if (roles.includes("sales_rep") && !hasAdminAccess) return "/rep/home";
    if (isEmployee && !hasAdminAccess) return "/employee";
    if (roles.includes("super_admin")) return "/super-admin/dashboard";
    if (roles.includes("portal") && !roles.includes("admin")) return "/portal/dashboard";
    if (roles.includes("store_tracker") && !roles.includes("admin")) return "/store-tracker";
    if (roles.includes("worker") && roles.length === 1) return "/worker/procurement";
    if (roles.includes("cashier") && !roles.includes("admin")) return "/choose-workspace";
    if (roles.includes("employee") && roles.length === 1) return "/employee";

    // Feedback-only (no admin, no employee)
    if (!hasAdminAccess && !isEmployee) {
      const fb = await checkFeedbackOnly(userId);
      if (fb) return "/feedback";
    }

    // Owner-like (admin / accountant_* / hr_manager / brand-new owner with no roles yet)
    const completed = await readOwnerOnboardingCompleted(userId);
    return completed ? "/apps" : "/onboarding";
  } catch {
    return "/onboarding"; // safest default for a fresh signup
  }
}