import { supabase } from "@/integrations/supabase/client";

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

export interface TenantOwnerCheck {
  /** True when the user is allowed to run the company-registration wizard. */
  canCreateTenant: boolean;
  /** Human-readable reason when blocked, undefined when allowed. */
  reason?:
    | "linked_employee"
    | "linked_pos_user"
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
    { data: rolesRows },
    { data: empRow },
    { data: posUserRow },
    { data: featurePermRows },
  ] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", authUserId),
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
      .from("user_feature_permissions" as any)
      .select("id")
      .eq("target_user_id", authUserId)
      .eq("access_state", "allow")
      .limit(1),
  ]);

  const roles = (rolesRows || []).map((r: any) => r.role as string);
  if (roles.includes("super_admin")) return { canCreateTenant: true };

  if (
    empRow &&
    (empRow as any).is_active &&
    !(empRow as any).is_terminated &&
    (empRow as any).user_id !== authUserId
  ) {
    return { canCreateTenant: false, reason: "linked_employee" };
  }

  if (
    posUserRow &&
    (posUserRow as any).is_active !== false &&
    (posUserRow as any).user_id !== authUserId
  ) {
    return { canCreateTenant: false, reason: "linked_pos_user" };
  }

  if (roles.some((r) => NON_OWNER_ROLES.has(r))) {
    return { canCreateTenant: false, reason: "non_owner_role" };
  }

  if (featurePermRows && featurePermRows.length > 0) {
    return { canCreateTenant: false, reason: "granted_feature_perm" };
  }

  return { canCreateTenant: true };
}