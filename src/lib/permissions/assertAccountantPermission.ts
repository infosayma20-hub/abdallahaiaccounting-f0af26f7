import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AccountantPermKey } from "@/hooks/useAccountantPermissions";

interface AssertOptions {
  /** Suppress the toast on deny (caller will handle UX). */
  silent?: boolean;
  /** Override the deny message. */
  message?: string;
  /** Require ALL listed keys instead of any-of (default any-of). */
  all?: boolean;
}

const ACCOUNTANT_ROLE_PREFIX = "accountant_";

/**
 * Server-trusted accountant permission check for sensitive event handlers.
 * Use INSIDE handlers — UI hiding via <AccountantPermGuard> alone is not
 * enough since handlers can be invoked from devtools.
 *
 *   await assertAccountantPermission("can_delete_invoices");
 *   await assertAccountantPermission(
 *     ["can_create_receipt", "can_create_payment"],
 *     { all: true }
 *   );
 *
 * Bypass rules (returns true silently):
 *   - admin / super_admin
 *   - any user who is NOT an accountant-only user (owner, sales, etc.)
 *
 * Throws on deny, shows toast unless { silent: true }.
 */
export async function assertAccountantPermission(
  perm: AccountantPermKey | AccountantPermKey[],
  opts: AssertOptions = {},
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (!opts.silent) toast.error("يجب تسجيل الدخول");
    throw new Error("not_authenticated");
  }

  const { data: rolesRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roles = (rolesRows || []).map((r: any) => String(r.role));

  const admin = roles.includes("admin") || roles.includes("super_admin");
  if (admin) return;

  const accountantOnly =
    roles.length > 0 && roles.every((r) => r.startsWith(ACCOUNTANT_ROLE_PREFIX));
  // Non-accountant users bypass these accountant-specific checks.
  if (!accountantOnly) return;

  const { data: row } = await supabase
    .from("accountant_permissions")
    .select("*")
    .eq("accountant_auth_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const keys = Array.isArray(perm) ? perm : [perm];
  const checker = (k: AccountantPermKey) => !!(row && (row as any)[k] === true);
  const allowed = opts.all ? keys.every(checker) : keys.some(checker);

  if (!allowed) {
    if (!opts.silent) {
      toast.error(opts.message ?? "لا تملك صلاحية تنفيذ هذه العملية");
    }
    throw new Error(`accountant_permission_denied:${keys.join(",")}`);
  }
}

/** Boolean variant — does not throw or toast. */
export async function hasAccountantPermission(
  perm: AccountantPermKey | AccountantPermKey[],
  all = false,
): Promise<boolean> {
  try {
    await assertAccountantPermission(perm, { silent: true, all });
    return true;
  } catch {
    return false;
  }
}