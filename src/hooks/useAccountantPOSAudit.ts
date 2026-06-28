import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current user's POS-audit configuration *if* they are an
 * accountant restricted via `accountant_permissions`. Owners / admins /
 * non-accountants get `{ isAccountant: false, ... }` and full visibility.
 *
 * - `enabled`           — `can_audit_pos_shifts` flag (false if no row).
 * - `allowedBranchIds`  — empty array means "all branches"; otherwise an
 *                        explicit allow-list. For branches OUTSIDE this list,
 *                        the POS Reports UI shows the branch name but hides
 *                        every monetary figure.
 */
export function useAccountantPOSAudit() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isAccountant, setIsAccountant] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [allowedBranchIds, setAllowedBranchIds] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const list = (roles || []).map((r: any) => String(r.role));
        const admin = list.includes("admin") || list.includes("super_admin");
        const accountantOnly =
          list.length > 0 && list.every((r) => r.startsWith("accountant_"));
        if (cancelled) return;
        if (admin || !accountantOnly) {
          setIsAccountant(false);
          setLoading(false);
          return;
        }
        setIsAccountant(true);
        const { data } = await supabase
          .from("accountant_permissions")
          .select("can_audit_pos_shifts, pos_allowed_branch_ids, is_active")
          .eq("accountant_auth_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (cancelled) return;
        setEnabled(((data as any)?.can_audit_pos_shifts as boolean) === true);
        setAllowedBranchIds(
          Array.isArray((data as any)?.pos_allowed_branch_ids)
            ? ((data as any).pos_allowed_branch_ids as string[])
            : [],
        );
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  /** True ⇢ amounts must be hidden for the given branch (or "all-branches" view). */
  const shouldMaskBranchAmounts = (branchId: string | null): boolean => {
    if (!isAccountant || !enabled) return false;
    if (allowedBranchIds.length === 0) return false; // no restriction
    if (!branchId) return true; // "all branches" mixes restricted + allowed → mask
    return !allowedBranchIds.includes(branchId);
  };

  return {
    loading,
    isAccountant,
    enabled,
    allowedBranchIds,
    shouldMaskBranchAmounts,
    /** View-only mode (no export, no print, no edits) for the accountant. */
    isViewOnly: isAccountant && enabled,
  };
}