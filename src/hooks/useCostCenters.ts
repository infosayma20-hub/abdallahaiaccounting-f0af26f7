import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CostCenter {
  id: string;
  user_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  notes: string | null;
  parent_id: string | null;
  center_type: string;
  manager_employee_id: string | null;
  branch_id: string | null;
  is_active: boolean;
  is_deleted: boolean;
  display_order: number;
}

export function useCostCenters(opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["cost_centers", { includeInactive: !!opts.includeInactive }],
    queryFn: async () => {
      let q = supabase
        .from("cost_centers" as any)
        .select("*")
        .eq("is_deleted", false)
        .order("code", { ascending: true });
      if (!opts.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as CostCenter[];
    },
    staleTime: 60_000,
  });
}

export const COST_CENTER_TYPES: { value: string; label: string }[] = [
  { value: "department", label: "قسم / إدارة" },
  { value: "branch", label: "فرع" },
  { value: "workshop", label: "ورشة" },
  { value: "project", label: "مشروع" },
  { value: "operational", label: "تشغيلي" },
  { value: "custom", label: "أخرى" },
];

export function costCenterTypeLabel(t: string) {
  return COST_CENTER_TYPES.find((x) => x.value === t)?.label || t;
}