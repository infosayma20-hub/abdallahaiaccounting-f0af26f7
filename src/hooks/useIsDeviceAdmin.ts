import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Returns whether the current user is allowed to manage device-level POS
 * settings (branch / terminal / print bridge).
 *
 * Allowed: admin, super_admin, supervisor, OR user with NO roles assigned
 * (treated as the business owner — same convention as RoleGuard).
 * Blocked: cashier, employee, sales_rep, worker, etc.
 */
export function useIsDeviceAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isDeviceAdmin, setIsDeviceAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setChecking(true);
      return;
    }
    if (!user) {
      setIsDeviceAdmin(false);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (cancelled) return;
      const roles = (data || []).map((r) => r.role);
      // Owner with no roles assigned = treated as admin (same as RoleGuard).
      const allowedRoles = ["admin", "super_admin", "supervisor"];
      const allowed =
        roles.length === 0 || roles.some((r) => allowedRoles.includes(r));
      setIsDeviceAdmin(allowed);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { isDeviceAdmin, checking: authLoading || checking };
}