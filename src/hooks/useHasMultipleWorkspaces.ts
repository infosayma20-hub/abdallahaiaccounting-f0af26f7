import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns true when the current auth user has access to more than one
 * workspace (employee / cashier / sales rep / call-center / feedback).
 * Used to decide whether to show a "back to workspace chooser" affordance
 * inside a specific workspace (e.g. /employee).
 *
 * Safe by design: defaults to false on any error/loading state so we never
 * surface the back arrow to single-workspace users by accident.
 */
export function useHasMultipleWorkspaces(): { hasMultiple: boolean; loading: boolean } {
  const { user } = useAuth();
  const [hasMultiple, setHasMultiple] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setHasMultiple(false);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [{ data: rolesData }, { data: posUser }, { data: empRow }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase
            .from("pos_users")
            .select("is_call_center")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
          supabase
            .from("employees")
            .select("id, is_active, is_terminated")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
        ]);
        const roles = (rolesData || []).map((r) => String(r.role));
        const hasRep = roles.includes("sales_rep");
        const hasCashier = roles.includes("cashier") || !!posUser;
        const linkedEmp = empRow as { is_active?: boolean | null; is_terminated?: boolean | null } | null;
        const hasEmployee = !!linkedEmp && !!linkedEmp.is_active && !linkedEmp.is_terminated;
        // Note: feedback workspace is permission-driven; we conservatively
        // count it only via cashier/call-center linkage above. If we later
        // want to include it, we can add the same permission check used in
        // ChooseWorkspacePage.
        const count = (hasRep ? 1 : 0) + (hasCashier ? 1 : 0) + (hasEmployee ? 1 : 0);
        if (!cancelled) setHasMultiple(count > 1);
      } catch {
        if (!cancelled) setHasMultiple(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { hasMultiple, loading };
}