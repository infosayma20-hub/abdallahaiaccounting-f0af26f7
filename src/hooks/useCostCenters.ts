import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

/** Whether the given cost center has any related transactions/vouchers/invoices. */
export async function costCenterHasUsage(costCenterId: string): Promise<boolean> {
  const tables = ["transactions", "vouchers", "voucher_lines", "invoices", "invoice_items"] as const;
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t as any)
      .select("id", { head: true, count: "exact" })
      .eq("cost_center_id", costCenterId);
    if (!error && (count || 0) > 0) return true;
  }
  return false;
}

export interface CostCenterUpsertInput {
  id?: string;
  code: string;
  name: string;
  name_ar?: string | null;
  center_type: string;
  parent_id?: string | null;
  branch_id?: string | null;
  manager_employee_id?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

export function useCostCenterMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cost_centers"] });

  const upsert = useMutation({
    mutationFn: async (input: CostCenterUpsertInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("غير مسجل الدخول");

      // Duplicate code check (same user, not soft-deleted, excluding current id)
      const dupQ = supabase
        .from("cost_centers" as any)
        .select("id")
        .eq("user_id", dataOwnerId!)
        .eq("code", input.code.trim())
        .eq("is_deleted", false)
        .limit(1);
      const { data: dup } = await dupQ;
      const dupRow = (dup || [])[0] as any;
      if (dupRow && dupRow.id !== input.id) {
        throw new Error(`الكود "${input.code}" مستخدم في مركز تكلفة آخر`);
      }

      const payload: any = {
        user_id: dataOwnerId!,
        code: input.code.trim(),
        name: input.name.trim(),
        name_ar: input.name_ar?.trim() || null,
        center_type: input.center_type,
        parent_id: input.parent_id || null,
        branch_id: input.branch_id || null,
        manager_employee_id: input.manager_employee_id || null,
        is_active: input.is_active ?? true,
        notes: input.notes?.trim() || null,
      };

      if (input.id) {
        const { error } = await supabase
          .from("cost_centers" as any)
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      } else {
        const { data, error } = await supabase
          .from("cost_centers" as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id as string;
      }
    },
    onSuccess: invalidate,
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("cost_centers" as any)
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const used = await costCenterHasUsage(id);
      if (used) {
        throw new Error("لا يمكن الحذف: يوجد حركات مرتبطة. استخدم الإيقاف بدلاً من الحذف.");
      }
      // Soft delete to keep audit trail.
      const { error } = await supabase
        .from("cost_centers" as any)
        .update({ is_deleted: true, is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { upsert, setActive, remove };
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