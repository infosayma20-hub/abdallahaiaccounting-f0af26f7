import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useDataOwnerId } from "./useDataOwnerId";

export type ShiftTemplate = {
  id: string;
  company_id: string;
  code: string;
  name_ar: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  color: string;
  is_active: boolean;
};

export type RosterEntry = {
  id: string;
  company_id: string;
  branch_id: string;
  employee_id: string;
  roster_date: string;
  shift_template_id: string | null;
  status: "scheduled" | "off" | "leave" | "coverage";
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
};

export type ManagerBranch = {
  branch_id: string;
  company_id: string;
  branch_name: string;
};

export type ManagedBranchEmployee = {
  id: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  branch_id: string | null;
  company_id: string;
  manager_employee_id: string | null;
  department: string | null;
};

/** Current employee row (the one linked to auth.uid via auth_user_id). */
export function useCurrentEmployee() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  return useQuery({
    queryKey: ["current-employee", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, user_id, company_id, branch_id, can_view_team, can_manage_schedule, can_manage_attendance")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

/** Branches the current manager-employee can see (derived from team employees). */
export function useManagerBranches() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  return useQuery({
    queryKey: ["manager-branches", user?.id, dataOwnerId],
    enabled: !!user?.id && !!dataOwnerId,
    queryFn: async (): Promise<ManagerBranch[]> => {
      // Check the CURRENT user's roles (HR manager team accounts hold
      // hr_manager on their own auth uid, not on the owner's uid).
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      const r = (roles || []).map((x: any) => x.role);
      const isAdmin = r.includes("admin") || r.includes("hr_manager") || r.includes("super_admin");
      if (isAdmin) {
        const { data: allBr, error: brErr } = await supabase
          .from("branches")
          .select("id, name, user_id")
          .eq("user_id", dataOwnerId!)
          .eq("is_active", true)
          .order("name");
        if (brErr) {
          console.error("[useManagerBranches] admin branches load failed:", brErr);
          throw brErr;
        }
        console.debug("[useManagerBranches] admin branches loaded:", {
          count: allBr?.length || 0,
          user_id: dataOwnerId,
        });
        return (allBr || []).map((b: any) => ({
          branch_id: b.id,
          company_id: b.user_id,
          branch_name: b.name || "—",
        }));
      }
      // 2) Branch scheduler/manager → branches explicitly assigned to their account
      const { data, error } = await supabase
        .from("branch_manager_assignments")
        .select("branch_id, company_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      const assignments = (data || []) as { branch_id: string; company_id: string }[];
      if (!assignments.length) return [];
      const { data: br, error: brErr } = await supabase
        .from("branches")
        .select("id, name")
        .in("id", assignments.map((a) => a.branch_id))
        .order("name");
      if (brErr) throw brErr;
      const branchNames = new Map((br || []).map((b: any) => [b.id, b.name || "—"]));
      return assignments.map((a) => ({
        branch_id: a.branch_id,
        company_id: a.company_id,
        branch_name: branchNames.get(a.branch_id) || "—",
      }));
    },
  });
}

/** Unified source for team members managed by the current user: branch_manager_assignments → employees.branch_id. */
export function useManagedBranchEmployees(branchId?: string | null) {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  return useQuery({
    queryKey: ["managed-branch-employees", user?.id, dataOwnerId, branchId || "all"],
    enabled: !!user?.id && !!dataOwnerId,
    queryFn: async (): Promise<ManagedBranchEmployee[]> => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      const roleList = (roles || []).map((r: any) => r.role);
      const isAdmin = roleList.includes("admin") || roleList.includes("hr_manager") || roleList.includes("super_admin");

      let allowedBranchIds: string[] = [];
      if (isAdmin && branchId) {
        allowedBranchIds = [branchId];
      } else if (isAdmin && !branchId) {
        allowedBranchIds = [];
      } else {
        const { data: assignments, error: assignmentError } = await supabase
          .from("branch_manager_assignments")
          .select("branch_id")
          .eq("user_id", user!.id);
        if (assignmentError) throw assignmentError;
        allowedBranchIds = ((assignments || []) as { branch_id: string }[]).map((a) => a.branch_id);
        if (branchId) allowedBranchIds = allowedBranchIds.filter((id) => id === branchId);
      }

      if (!allowedBranchIds.length) return [];
      // Non-admin managers: restrict to their direct reports (employees.manager_employee_id).
      // This lets multiple managers split a branch across different shifts.
      let managerEmpId: string | null = null;
      if (!isAdmin) {
        const { data: meRow } = await supabase
          .from("employees")
          .select("id")
          .eq("auth_user_id", user!.id)
          .eq("user_id", dataOwnerId!)
          .maybeSingle();
        managerEmpId = (meRow as any)?.id ?? null;
      }
      let query = supabase
        .from("employees")
        .select("id, full_name, position, phone, branch_id, company_id, manager_employee_id, department")
        .eq("user_id", dataOwnerId!)
        .in("branch_id", allowedBranchIds)
        .eq("is_active", true);
      if (managerEmpId) query = query.eq("manager_employee_id", managerEmpId);
      const { data, error } = await query.order("full_name");
      if (error) throw error;
      return (data || []) as ManagedBranchEmployee[];
    },
  });
}

export function useShiftTemplates(companyId: string | undefined) {
  return useQuery({
    queryKey: ["shift-templates", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ShiftTemplate[]> => {
      const { data, error } = await supabase
        .from("shift_templates")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("start_time");
      if (error) throw error;
      return data as any;
    },
  });
}

/** Employees in a branch — RLS will further restrict to team for non-admin/HR users. */
export function useBranchEmployees(branchId: string | undefined, managerEmployeeId?: string | undefined) {
  return useQuery({
    queryKey: ["branch-employees", branchId, managerEmployeeId],
    enabled: !!branchId,
    queryFn: async () => {
      let q = supabase
        .from("employees")
        .select("id, full_name, position, phone, manager_employee_id")
        .eq("branch_id", branchId!)
        .eq("is_active", true);
      if (managerEmployeeId) q = q.eq("manager_employee_id", managerEmployeeId);
      const { data, error } = await q.order("full_name");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useWeekRoster(branchId: string | undefined, weekStart: string | undefined, weekEnd: string | undefined) {
  return useQuery({
    queryKey: ["week-roster", branchId, weekStart, weekEnd],
    enabled: !!branchId && !!weekStart && !!weekEnd,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data, error } = await supabase
        .from("daily_roster")
        .select("*")
        .eq("branch_id", branchId!)
        .gte("roster_date", weekStart!)
        .lte("roster_date", weekEnd!);
      if (error) throw error;
      return data as any;
    },
  });
}

export function useUpsertRoster() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  return useMutation({
    mutationFn: async (entry: Partial<RosterEntry> & {
      company_id: string;
      branch_id: string;
      employee_id: string;
      roster_date: string;
    }) => {
      const payload = { ...entry, created_by: user?.id };
      const { data, error } = await supabase
        .from("daily_roster")
        .upsert(payload, { onConflict: "employee_id,roster_date" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-roster"] }),
  });
}

export function useDeleteRosterEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_roster").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-roster"] }),
  });
}

/** Employee's own week (uses RLS — they only see their own row). */
export function useMyRoster(employeeId: string | undefined, weekStart: string, weekEnd: string) {
  return useQuery({
    queryKey: ["my-roster", employeeId, weekStart, weekEnd],
    enabled: !!employeeId,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data, error } = await supabase
        .from("daily_roster")
        .select("*")
        .eq("employee_id", employeeId!)
        .gte("roster_date", weekStart)
        .lte("roster_date", weekEnd)
        .order("roster_date");
      if (error) throw error;
      return data as any;
    },
  });
}