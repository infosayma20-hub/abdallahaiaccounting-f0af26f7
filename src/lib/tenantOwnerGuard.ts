import { supabase } from "@/integrations/supabase/client";
import { isAuthSessionExpiredError, redirectToSessionExpired } from "@/lib/sessionExpired";

// Roles that DO NOT belong to a tenant owner. Tenant owners only ever
// hold `admin` (or no role). Anyone with one of these is bound to an
// existing tenant and must NEVER trigger the company-registration
// wizard — that would seed orphan tenant data under their own auth UID.
const NON_OWNER_ROLES = new Set<string>([
  "hr_manager",
  "accountant_senior", "accountant_sales", "accountant_purchases",
  "cashier", "sales_rep", "employee", "portal", "worker", "store_tracker",
  "branch_scheduler", "call_center",
]);

type ProfileTenantMarker = { invited_by?: string | null; role?: string | null };
type EmployeeTenantMarker = { user_id?: string | null; is_active?: boolean | null; is_terminated?: boolean | null };
type LinkedTenantMarker = { user_id?: string | null; is_active?: boolean | null };

const dataOrFail = <T,>(result: { data: T; error: unknown }): T => {
  if (result.error) {
    if (isAuthSessionExpiredError(result.error)) redirectToSessionExpired();
    throw result.error;
  }
  return result.data;
};

export interface TenantOwnerCheck {
  /** True when the user is allowed to run the company-registration wizard. */
  canCreateTenant: boolean;
  /** Human-readable reason when blocked, undefined when allowed. */
  reason?:
    | "linked_employee"
    | "linked_pos_user"
    | "linked_portal_user"
    | "invited_profile"
    | "non_owner_role"
    | "granted_feature_perm";
}

/**
 * Returns whether the given auth user is allowed to create a brand-new
 * company / tenant via the SetupWizard. Mirrors the server-side guard in
 * the `setup-accounts` edge function. Keep both in sync.
 */
export async function canUserCreateTenant(authUserId: string): Promise<TenantOwnerCheck> {
  const [
    rolesResult,
    profileResult,
    empResult,
    posUserResult,
    portalUserResult,
    featurePermResult,
  ] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", authUserId),
    supabase
      .from("profiles")
      .select("invited_by, role")
      .eq("user_id", authUserId)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, user_id, is_active, is_terminated")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
    supabase
      .from("pos_users")
      .select("id, user_id, is_active, is_call_center")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
    supabase
      .from("malaki_portal_users")
      .select("id, user_id, is_active")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
    supabase
      .from("user_feature_permissions")
      .select("id")
      .eq("target_user_id", authUserId)
      .eq("access_state", "allow")
      .limit(1),
  ]);

  const rolesRows = dataOrFail(rolesResult);
  const profileRow = dataOrFail(profileResult);
  const empRow = dataOrFail(empResult);
  const posUserRow = dataOrFail(posUserResult);
  const portalUserRow = dataOrFail(portalUserResult);
  const featurePermRows = dataOrFail(featurePermResult);

  const profile = profileRow as ProfileTenantMarker | null;
  const employee = empRow as EmployeeTenantMarker | null;
  const posUser = posUserRow as LinkedTenantMarker | null;
  const portalUser = portalUserRow as LinkedTenantMarker | null;
  const roles = (rolesRows || []).map((r) => String(r.role));
  if (roles.includes("super_admin")) return { canCreateTenant: true };

  if (profile?.invited_by && profile.invited_by !== authUserId) {
    return { canCreateTenant: false, reason: "invited_profile" };
  }

  if (
    employee &&
    employee.is_active &&
    !employee.is_terminated &&
    employee.user_id !== authUserId
  ) {
    return { canCreateTenant: false, reason: "linked_employee" };
  }

  if (
    posUser &&
    posUser.is_active !== false &&
    posUser.user_id !== authUserId
  ) {
    return { canCreateTenant: false, reason: "linked_pos_user" };
  }

  if (
    portalUser &&
    portalUser.is_active !== false &&
    portalUser.user_id !== authUserId
  ) {
    return { canCreateTenant: false, reason: "linked_portal_user" };
  }

  const profileRole = profile?.role || undefined;
  if (roles.some((r) => NON_OWNER_ROLES.has(r)) || (profileRole && NON_OWNER_ROLES.has(profileRole))) {
    return { canCreateTenant: false, reason: "non_owner_role" };
  }

  if (featurePermRows && featurePermRows.length > 0) {
    return { canCreateTenant: false, reason: "granted_feature_perm" };
  }

  return { canCreateTenant: true };
}