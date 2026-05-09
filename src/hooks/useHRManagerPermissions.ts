import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type HRPerms = {
  can_add_employees: boolean;
  can_edit_employees: boolean;
  can_delete_employees: boolean;
  can_view_salary_info: boolean;
  can_manage_attendance: boolean;
  can_edit_attendance: boolean;
  can_manage_branches: boolean;
  can_approve_leaves: boolean;
  can_manage_leave_policy: boolean;
  can_manage_holidays: boolean;
  can_process_payroll: boolean;
  can_approve_payroll: boolean;
  can_manage_deductions: boolean;
  can_manage_advances: boolean;
  can_manage_loans: boolean;
  can_approve_requests: boolean;
  can_manage_forms: boolean;
  can_view_hr_reports: boolean;
  can_export_hr_data: boolean;
  can_manage_hr_settings: boolean;
};

export type HRPermKey = keyof HRPerms;

/**
 * Loads detailed HR permissions for the current auth user.
 * Admins (any user without an HR-only role, or with role=admin) bypass with full access.
 * HR managers get exactly the permissions stored in hr_manager_permissions.
 */
export function useHRManagerPermissions() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<HRPerms | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHRManager, setIsHRManager] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roleList = (roles || []).map((r) => r.role);
      const admin = roleList.length === 0 || roleList.includes("admin") || roleList.includes("super_admin");
      const hrManager = roleList.includes("hr_manager");

      if (cancelled) return;
      setIsAdmin(admin);
      setIsHRManager(hrManager);

      if (admin) {
        setPerms(null);
        setLoading(false);
        return;
      }

      if (hrManager) {
        const { data } = await supabase
          .from("hr_manager_permissions")
          .select("*")
          .eq("hr_auth_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (!cancelled) setPerms((data as HRPerms) || null);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, authLoading]);

  /** Check one or more permission keys (any-of). Admin always returns true. */
  const can = (...keys: HRPermKey[]): boolean => {
    if (isAdmin) return true;
    if (!perms) return false;
    return keys.some((k) => perms[k] === true);
  };

  return { loading: loading || authLoading, isAdmin, isHRManager, perms, can };
}