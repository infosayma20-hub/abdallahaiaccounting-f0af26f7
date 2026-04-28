import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * useEmployeeFinancialMovements (B3.1 — Sub-Ledger CRUD)
 * ------------------------------------------------------------------
 * Read + write helpers for the unified employee financial sub-ledger.
 * Source of truth: public.employee_financial_movements
 *
 * Constraints (enforced at DB level):
 *  - category ∈ {food, transport, loan_installment, advance, penalty,
 *                purchase, cash_shortage, cash_surplus, adjustment,
 *                previous_balance, other} or NULL (legacy)
 *  - Locked days reject manual writes (POS/system are exempt).
 *
 * No journal entries, no payroll mutation.
 */

export const MOVEMENT_CATEGORIES = [
  { value: "food", label: "وجبات / أكل" },
  { value: "transport", label: "مواصلات" },
  { value: "advance", label: "سلفة" },
  { value: "loan_installment", label: "قسط قرض" },
  { value: "penalty", label: "مخالفة" },
  { value: "purchase", label: "مشتريات على حساب الموظف" },
  { value: "cash_shortage", label: "عجز صندوق" },
  { value: "cash_surplus", label: "فائض صندوق" },
  { value: "adjustment", label: "تسوية" },
  { value: "previous_balance", label: "رصيد سابق" },
  { value: "other", label: "أخرى" },
] as const;

export const tCategory = (v?: string | null) => {
  if (!v) return "غير مصنفة";
  return MOVEMENT_CATEGORIES.find((c) => c.value === v)?.label || v;
};

export type EmployeeMovement = {
  id: string;
  employee_id: string;
  movement_date: string;
  movement_type: "debit" | "credit" | string;
  category: string | null;
  amount: number;
  description: string | null;
  reference_number: string | null;
  source_type: string | null;
  source_id: string | null;
  source_reference: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
};

export type MovementFilters = {
  from?: string;
  to?: string;
  category?: string | null; // "all" | category | "unclassified"
  direction?: "all" | "debit" | "credit";
};

export function useEmployeeMovements(
  employeeId: string | undefined,
  filters: MovementFilters = {},
) {
  return useQuery<EmployeeMovement[]>({
    queryKey: ["employee-movements", employeeId, filters],
    enabled: !!employeeId,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("employee_financial_movements")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("movement_date", { ascending: false })
        .limit(500);

      if (filters.from) q = q.gte("movement_date", filters.from);
      if (filters.to) q = q.lte("movement_date", filters.to);
      if (filters.direction && filters.direction !== "all") {
        q = q.eq("movement_type", filters.direction);
      }
      if (filters.category && filters.category !== "all") {
        if (filters.category === "unclassified") {
          q = q.is("category", null);
        } else {
          q = q.eq("category", filters.category);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as EmployeeMovement[];
    },
  });
}

export type CreateMovementInput = {
  employee_id: string;
  movement_date: string;
  movement_type: "debit" | "credit";
  category: string;
  amount: number;
  description?: string;
  reference_number?: string;
  notes?: string;
};

export function useCreateEmployeeMovement() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: CreateMovementInput) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) throw new Error("غير مصرح");

      const payload: any = {
        employee_id: input.employee_id,
        movement_date: input.movement_date,
        movement_type: input.movement_type,
        category: input.category,
        amount: input.amount,
        description: input.description || null,
        reference_number: input.reference_number || null,
        notes: input.notes || null,
        source_type: "hr_manual",
        user_id: userId,
        created_by: userId,
        status: "approved",
      };
      const { data, error } = await supabase
        .from("employee_financial_movements")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["employee-movements", vars.employee_id] });
      qc.invalidateQueries({ queryKey: ["payroll-preview", vars.employee_id] });
      qc.invalidateQueries({ queryKey: ["employee-360", vars.employee_id] });
      toast({ title: "تمت الإضافة", description: "تم تسجيل الحركة المالية." });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "تعذر الحفظ", description: e?.message || "خطأ غير معروف" });
    },
  });
}

export type UpdateMovementInput = Partial<CreateMovementInput> & { id: string; employee_id: string };

export function useUpdateEmployeeMovement() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: UpdateMovementInput) => {
      const { id, employee_id, ...rest } = input;
      const patch: any = { ...rest };
      const { data, error } = await supabase
        .from("employee_financial_movements")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["employee-movements", vars.employee_id] });
      qc.invalidateQueries({ queryKey: ["payroll-preview", vars.employee_id] });
      toast({ title: "تم التحديث" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "تعذر التحديث", description: e?.message || "خطأ غير معروف" });
    },
  });
}

export function useDeleteEmployeeMovement() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, employee_id }: { id: string; employee_id: string }) => {
      const { error } = await supabase
        .from("employee_financial_movements")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { id, employee_id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employee-movements", res.employee_id] });
      qc.invalidateQueries({ queryKey: ["payroll-preview", res.employee_id] });
      toast({ title: "تم الحذف" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "تعذر الحذف", description: e?.message || "خطأ غير معروف" });
    },
  });
}
