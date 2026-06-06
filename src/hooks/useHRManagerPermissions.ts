import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type HRPerms = {
  // Employees
  can_view_employees: boolean;
  can_add_employees: boolean;
  can_edit_employees: boolean;
  can_delete_employees: boolean;
  can_view_salary_info: boolean;
  can_view_employee_documents: boolean;
  can_edit_employee_documents: boolean;
  can_view_employee_bank_info: boolean;
  can_view_employee_private_info: boolean;
  // Attendance
  can_view_attendance: boolean;
  can_manage_attendance: boolean;
  can_edit_attendance: boolean;
  can_approve_attendance_corrections: boolean;
  can_issue_penalties: boolean;
  can_manage_branches: boolean;
  can_view_gps_qr_details: boolean;
  can_export_attendance: boolean;
  // Roster / Shifts
  can_view_roster: boolean;
  can_manage_schedule: boolean;
  can_publish_roster: boolean;
  can_manage_shift_templates: boolean;
  can_manage_day_types: boolean;
  // Leaves & Requests
  can_view_leaves: boolean;
  can_approve_leaves: boolean;
  can_manage_leave_policy: boolean;
  can_manage_holidays: boolean;
  can_view_employee_requests: boolean;
  can_approve_requests: boolean;
  can_manage_forms: boolean;
  // Payroll
  can_view_payroll: boolean;
  can_preview_payroll: boolean;
  can_process_payroll: boolean;
  can_approve_payroll: boolean;
  can_pay_payroll: boolean;
  can_manage_deductions: boolean;
  can_manage_advances: boolean;
  can_manage_loans: boolean;
  can_view_staff_cost: boolean;
  // Reports
  can_view_hr_reports: boolean;
  can_view_hr_payroll_reports: boolean;
  can_view_hr_attendance_reports: boolean;
  can_view_hr_leave_reports: boolean;
  can_view_hr_staff_cost_reports: boolean;
  can_export_hr_data: boolean;
  can_print_hr_reports: boolean;
  // Settings & portal
  can_manage_hr_settings: boolean;
  can_view_team_schedule_admin: boolean;
  can_manage_team_schedule_visibility: boolean;
  can_view_employee_portal_links: boolean;
  can_reset_employee_passwords: boolean;
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
      try {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roleList = (roles || []).map((r) => r.role);
        // SECURITY: empty roles must NOT be treated as admin. Without an
        // explicit `admin`/`super_admin` row the user gets no HR-admin
        // privileges; UI then falls back to per-feature permission checks.
        const admin = roleList.includes("admin") || roleList.includes("super_admin");
        const hrManager = roleList.includes("hr_manager");

        if (cancelled) return;
        setIsAdmin(admin);
        setIsHRManager(hrManager);

        if (admin) {
          setPerms(null);
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
      } catch (err) {
        console.warn("[useHRManagerPermissions] fetch failed:", err);
        if (!cancelled) {
          setIsAdmin(false);
          setIsHRManager(false);
          setPerms(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
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