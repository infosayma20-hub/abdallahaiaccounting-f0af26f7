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

/** Branches this user manages (for the new branch_scheduler role). */
export function useManagerBranches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["manager-branches", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ManagerBranch[]> => {
      const { data, error } = await supabase
        .from("branch_manager_assignments")
        .select("branch_id, company_id, branches:branch_id(name)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        branch_id: r.branch_id,
        company_id: r.company_id,
        branch_name: r.branches?.name || "—",
      }));
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

export function useBranchEmployees(branchId: string | undefined) {
  return useQuery({
    queryKey: ["branch-employees", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, position, phone")
        .eq("branch_id", branchId!)
        .eq("is_active", true)
        .order("full_name");
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