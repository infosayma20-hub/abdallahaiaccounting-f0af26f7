import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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

/** Current employee row (the one linked to auth.uid via auth_user_id). */
export function useCurrentEmployee() {
  const { user } = useAuth();
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
  const { data: me } = useCurrentEmployee();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["manager-branches", me?.id || "no-emp", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ManagerBranch[]> => {
      // 1) Admin / HR manager → return ALL company branches
      let isAdmin = false;
      if (user?.id) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const r = (roles || []).map((x: any) => x.role);
        isAdmin = r.includes("admin") || r.includes("hr_manager");
      }
      if (isAdmin) {
        const { data: allBr } = await supabase
          .from("branches")
          .select("id, name, user_id, company_id")
          .eq("is_active", true)
          .order("name");
        return (allBr || []).map((b: any) => ({
          branch_id: b.id,
          company_id: b.company_id || b.user_id,
          branch_name: b.name || "—",
        }));
      }
      // 2) Regular manager → branches derived from team employees
      if (!me?.id) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("branch_id, company_id, branches:branch_id(name)")
        .eq("manager_employee_id", me!.id)
        .eq("is_active", true);
      if (error) throw error;
      const seen = new Set<string>();
      const out: ManagerBranch[] = [];
      (data || []).forEach((r: any) => {
        if (!r.branch_id || seen.has(r.branch_id)) return;
        seen.add(r.branch_id);
        out.push({
          branch_id: r.branch_id,
          company_id: r.company_id,
          branch_name: r.branches?.name || "—",
        });
      });
      // Fallback: if manager has no team yet, expose their own branch
      if (!out.length && me?.branch_id) {
        const { data: br } = await supabase.from("branches").select("name").eq("id", me.branch_id).maybeSingle();
        out.push({ branch_id: me.branch_id, company_id: me.company_id, branch_name: (br as any)?.name || "—" });
      }
      return out;
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