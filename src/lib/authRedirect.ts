import { supabase } from "@/integrations/supabase/client";

/**
 * Reads owner-onboarding completion for a given user.
 * Returns:
 *  - "na"         → the user is not an "owner-like" account (employee, cashier, portal, super_admin, sales_rep, feedback-only).
 *                   No onboarding gate should be applied; their dedicated screen is the destination.
 *  - "incomplete" → owner-like AND company_profiles.onboarding_completed is false (or company/profile missing).
 *  - "completed"  → owner-like AND onboarding_completed is true.
 */
export type OnboardingStatus = "na" | "incomplete" | "completed";

async function checkFeedbackOnly(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_feature_permissions")
    .select("id")
    .eq("target_user_id", userId)
    .eq("app_key", "call_center_feedback")
    .eq("access_state", "allow")
    .limit(1);
  return !!(data && data.length > 0);
}

async function readOwnerOnboardingCompleted(userId: string): Promise<boolean | null> {
  const { data: ownerIdData } = await supabase.rpc("get_team_owner_id", { _user_id: userId });
  const ownerId = (ownerIdData as string | null) || userId;
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!company) return false; // no company yet → must onboard
  const { data: profile } = await supabase
    .from("company_profiles")
    .select("onboarding_completed")
    .eq("company_id", company.id)
    .maybeSingle();
  return !!profile?.onboarding_completed;
}

export async function fetchOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  try {
    const [{ data: rolesData }, { data: emp }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("employees")
        .select("id, is_active, is_terminated")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);
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
    const [{ data: rolesData }, { data: emp }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("employees")
        .select("id, is_active, is_terminated")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);
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