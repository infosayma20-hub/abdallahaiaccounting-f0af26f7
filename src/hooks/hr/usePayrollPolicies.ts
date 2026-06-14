import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";

export interface PayrollPolicy {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  salary_basis: "monthly" | "daily" | "hourly";
  month_days_mode: "fixed_30" | "fixed_28" | "fixed_26" | "calendar" | "custom";
  month_days_custom: number | null;
  daily_work_hours: number;
  overtime_multiplier: number;
  overtime_after_hours: number | null;
  absence_calculation: "daily_rate" | "hourly_rate" | "custom_formula" | "none";
  absence_formula: string | null;
  late_calculation: "none" | "per_minute" | "per_hour" | "tiered" | "custom_formula";
  late_grace_minutes: number | null;
  late_per_minute_rate: number | null;
  late_formula: string | null;
  allowances_attendance_linked: boolean;
  deductions_mode: "auto" | "manual" | "mixed";
  is_active: boolean;
  is_default: boolean;
  engine_preset: "standard" | "malaki" | "custom";
  created_at: string;
  updated_at: string;
}

export type PolicyFormInput = Partial<
  Omit<PayrollPolicy, "id" | "company_id" | "created_at" | "updated_at">
> & { name: string };

const QK = ["hr-payroll-policies"] as const;

export function usePayrollPolicies() {
  const { dataOwnerId } = useDataOwnerId();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: [...QK, dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async (): Promise<PayrollPolicy[]> => {
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .select("*")
        .eq("company_id", dataOwnerId as string)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const counts = useQuery({
    queryKey: [...QK, dataOwnerId, "counts"],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("payroll_policy_id, is_active, company_id")
        .eq("company_id", dataOwnerId as string);
      const map = new Map<string, number>();
      if (!error && data) {
        for (const r of data as any[]) {
          if (r.is_active === false) continue;
          const k = r.payroll_policy_id || "__none__";
          map.set(k, (map.get(k) || 0) + 1);
        }
      }
      return map;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK });
  };

  const create = useMutation({
    mutationFn: async (input: PolicyFormInput) => {
      if (!dataOwnerId) throw new Error("لا يوجد صاحب بيانات");
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .insert({ ...input, company_id: dataOwnerId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("تم إنشاء السياسة"); invalidate(); },
    onError: (e: any) => toast.error(e.message || "تعذّر إنشاء السياسة"),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: PolicyFormInput & { id: string }) => {
      const { error } = await supabase
        .from("hr_payroll_policies")
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث السياسة"); invalidate(); },
    onError: (e: any) => toast.error(e.message || "تعذّر التحديث"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_payroll_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حذف السياسة"); invalidate(); },
    onError: (e: any) => toast.error(e.message || "لا يمكن حذف هذه السياسة"),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!dataOwnerId) throw new Error("لا يوجد صاحب بيانات");
      // unset others first, then set this one — uniqueness constraint requires this order
      const { error: e1 } = await supabase
        .from("hr_payroll_policies")
        .update({ is_default: false } as any)
        .eq("company_id", dataOwnerId)
        .neq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("hr_payroll_policies")
        .update({ is_default: true } as any)
        .eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("تم تعيين السياسة الافتراضية"); invalidate(); },
    onError: (e: any) => toast.error(e.message || "تعذّر التعيين"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("hr_payroll_policies")
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message || "تعذّر التحديث"),
  });

  const assignToEmployees = useMutation({
    mutationFn: async ({ employeeIds, policyId }: { employeeIds: string[]; policyId: string | null }) => {
      if (!employeeIds.length) return;
      const { error } = await supabase
        .from("employees")
        .update({ payroll_policy_id: policyId } as any)
        .in("id", employeeIds);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`تم تحديث ${vars.employeeIds.length} موظف`);
      qc.invalidateQueries({ queryKey: ["hr-payroll-policies"] });
      qc.invalidateQueries({ queryKey: ["employees-for-policy-assignment"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر التعيين"),
  });

  return { list, counts, create, update, remove, setDefault, toggleActive, assignToEmployees };
}
