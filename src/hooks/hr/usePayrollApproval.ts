import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * B3.6 — Payroll Approval Workflow (3-stage)
 * preview (no row) → submitted (soft lock) → approved (hard lock) → paid (B3.7)
 *
 * No accounting entries here. Posting happens later in B3.7.
 */

export type PayrollStatus =
  | "submitted"
  | "approved"
  | "paid"
  | "returned"
  | "cancelled";

export type EmployeePayrollRow = {
  id: string;
  user_id: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  base_salary: number;
  total_allowances: number;
  total_deductions: number;
  total_overtime: number;
  net_salary: number;
  is_paid: boolean;
  status: PayrollStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  batch_id: string | null;
  paid_date: string | null;
  notes: string | null;
};

export const PAYROLL_STATUS_META: Record<
  PayrollStatus | "preview",
  { label: string; tone: "muted" | "amber" | "emerald" | "primary" | "rose" }
> = {
  preview: { label: "🟡 معاينة", tone: "muted" },
  submitted: { label: "🔵 قيد الاعتماد", tone: "amber" },
  approved: { label: "🟢 معتمد", tone: "emerald" },
  paid: { label: "💰 مدفوع", tone: "primary" },
  returned: { label: "↩️ معاد للمراجعة", tone: "amber" },
  cancelled: { label: "❌ ملغي", tone: "rose" },
};

/* ------------------------------------------------------------------ */
/*  Single-employee row for a given period                            */
/* ------------------------------------------------------------------ */
export function useEmployeePayrollRow(
  employeeId: string | undefined,
  year: number,
  month: number,
) {
  return useQuery<EmployeePayrollRow | null>({
    queryKey: ["payroll-row", employeeId, year, month],
    enabled: !!employeeId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payroll")
        .select("*")
        .eq("employee_id", employeeId!)
        .eq("period_year", year)
        .eq("period_month", month)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || null;
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Submit a freshly-computed preview as a `submitted` row            */
/* ------------------------------------------------------------------ */
export type SubmitPayrollInput = {
  employee_id: string;
  period_month: number;
  period_year: number;
  base_salary: number;
  total_allowances: number;
  total_deductions: number;
  total_overtime: number;
  net_salary: number;
  attendance_salary?: number;
  notes?: string | null;
};

export function useSubmitPayroll() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: SubmitPayrollInput) => {
      const { data: u } = await supabase.auth.getUser();
      const submitter = u?.user?.id;
      if (!submitter) throw new Error("غير مصرح");

      const { data: ownerId } = await supabase.rpc("get_team_owner_id", {
        _user_id: submitter,
      });
      if (!ownerId) throw new Error("تعذر تحديد الشركة");

      const payload = { ...input, user_id: ownerId as string };

      const { data, error } = await supabase.rpc("payroll_submit_employee", {
        _payload: payload as any,
        _submitter: submitter,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["payroll-row", vars.employee_id] });
      qc.invalidateQueries({ queryKey: ["payroll-month"] });
      toast({
        title: "تم الحفظ للاعتماد",
        description: "الراتب الآن قيد الاعتماد. لا يمكن تعديل الحركات لهذا الشهر دون فك الاعتماد.",
      });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "تعذر الحفظ",
        description: e?.message || "خطأ غير معروف",
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Approve / Reject single employee                                  */
/* ------------------------------------------------------------------ */
export function useApprovePayroll() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      payrollId,
    }: { payrollId: string; employeeId?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const approver = u?.user?.id;
      if (!approver) throw new Error("غير مصرح");

      const { data, error } = await supabase.rpc("payroll_approve_employee", {
        _payroll_id: payrollId,
        _approver: approver,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_d, vars) => {
      if (vars.employeeId) {
        qc.invalidateQueries({ queryKey: ["payroll-row", vars.employeeId] });
      }
      qc.invalidateQueries({ queryKey: ["payroll-month"] });
      toast({ title: "تم الاعتماد", description: "الراتب الآن معتمد ومقفل." });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "تعذر الاعتماد",
        description: e?.message || "خطأ غير معروف",
      });
    },
  });
}

export function useRejectPayroll() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      payrollId,
      reason,
    }: { payrollId: string; reason: string; employeeId?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const approver = u?.user?.id;
      if (!approver) throw new Error("غير مصرح");
      if (!reason?.trim()) throw new Error("سبب الإرجاع مطلوب");

      const { data, error } = await supabase.rpc("payroll_reject_employee", {
        _payroll_id: payrollId,
        _approver: approver,
        _reason: reason.trim(),
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_d, vars) => {
      if (vars.employeeId) {
        qc.invalidateQueries({ queryKey: ["payroll-row", vars.employeeId] });
      }
      qc.invalidateQueries({ queryKey: ["payroll-month"] });
      toast({ title: "تم الإرجاع", description: "تم إرجاع الراتب للمراجعة." });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "تعذر الإرجاع",
        description: e?.message || "خطأ غير معروف",
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Monthly view + Batch approval                                     */
/* ------------------------------------------------------------------ */
export function usePayrollMonth(year: number, month: number) {
  return useQuery({
    queryKey: ["payroll-month", year, month],
    staleTime: 10_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) throw new Error("غير مصرح");

      const { data: ownerId } = await supabase.rpc("get_team_owner_id", {
        _user_id: userId,
      });
      if (!ownerId) throw new Error("تعذر تحديد الشركة");

      const [{ data: rows, error: e1 }, { data: batch, error: e2 }] =
        await Promise.all([
          supabase
            .from("employee_payroll")
            .select("*, employees(full_name, employee_code)")
            .eq("user_id", ownerId as string)
            .eq("period_year", year)
            .eq("period_month", month)
            .order("created_at", { ascending: true }),
          supabase
            .from("payroll_batches")
            .select("*")
            .eq("user_id", ownerId as string)
            .eq("period_year", year)
            .eq("period_month", month)
            .maybeSingle(),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;

      return {
        ownerId: ownerId as string,
        rows: (rows as any[]) || [],
        batch: batch as any | null,
      };
    },
  });
}

export function useApprovePayrollBatch() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      userId,
      year,
      month,
    }: { userId: string; year: number; month: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const approver = u?.user?.id;
      if (!approver) throw new Error("غير مصرح");

      const { data, error } = await supabase.rpc("payroll_approve_batch", {
        _user_id: userId,
        _month: month,
        _year: year,
        _approver: approver,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["payroll-month"] });
      qc.invalidateQueries({ queryKey: ["payroll-row"] });
      toast({
        title: "تم اعتماد الدفعة",
        description: `تم اعتماد ${res?.approved_count || 0} موظف بإجمالي صافي ₪${Number(res?.total_net_salary || 0).toFixed(2)}`,
      });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "تعذر اعتماد الدفعة",
        description: e?.message || "خطأ غير معروف",
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  B3.7 — Payment (Cash / Bank / Cheque)                             */
/* ------------------------------------------------------------------ */
export type PayrollPaymentMethod = "cash" | "bank" | "cheque";

export type PayPayrollInput = {
  payrollId: string;
  paymentMethod: PayrollPaymentMethod;
  bankAccountId?: string | null;
  chequeNumber?: string | null;
  chequeDueDate?: string | null;
  paymentDate?: string | null;
  employeeId?: string;
  paymentAccountCode?: string | null;
};

export function usePayPayrollEmployee() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: PayPayrollInput) => {
      const { data: u } = await supabase.auth.getUser();
      const payer = u?.user?.id;
      if (!payer) throw new Error("غير مصرح");

      const { data, error } = await supabase.rpc("payroll_pay_employee", {
        _payroll_id: input.payrollId,
        _payer: payer,
        _payment_method: input.paymentMethod,
        _bank_account_id: input.bankAccountId ?? null,
        _cheque_number: input.chequeNumber ?? null,
        _cheque_due_date: input.chequeDueDate ?? null,
        _payment_date: input.paymentDate ?? null,
        _payment_account_code: input.paymentAccountCode ?? null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_d, vars) => {
      if (vars.employeeId) {
        qc.invalidateQueries({ queryKey: ["payroll-row", vars.employeeId] });
      }
      qc.invalidateQueries({ queryKey: ["payroll-month"] });
      qc.invalidateQueries({ queryKey: ["employee-movements"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      toast({
        title: "تم الدفع",
        description: "تم إنشاء سند الصرف والقيد المحاسبي.",
      });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "تعذر الدفع",
        description: e?.message || "خطأ غير معروف",
      });
    },
  });
}

export type PayBatchInput = {
  userId: string;
  year: number;
  month: number;
  paymentMethod: PayrollPaymentMethod;
  bankAccountId?: string | null;
  chequeNumber?: string | null;
  chequeDueDate?: string | null;
  paymentDate?: string | null;
  paymentAccountCode?: string | null;
};

export function usePayPayrollBatch() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: PayBatchInput) => {
      const { data: u } = await supabase.auth.getUser();
      const payer = u?.user?.id;
      if (!payer) throw new Error("غير مصرح");

      const { data, error } = await supabase.rpc("payroll_pay_batch", {
        _user_id: input.userId,
        _month: input.month,
        _year: input.year,
        _payer: payer,
        _payment_method: input.paymentMethod,
        _bank_account_id: input.bankAccountId ?? null,
        _cheque_number: input.chequeNumber ?? null,
        _cheque_due_date: input.chequeDueDate ?? null,
        _payment_date: input.paymentDate ?? null,
        _payment_account_code: input.paymentAccountCode ?? null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["payroll-month"] });
      qc.invalidateQueries({ queryKey: ["payroll-row"] });
      qc.invalidateQueries({ queryKey: ["employee-movements"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      toast({
        title: "تم دفع الدفعة",
        description: `تم دفع ${res?.paid_count || 0} راتب بإجمالي ₪${Number(res?.total_amount || 0).toFixed(2)}`,
      });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "تعذر دفع الدفعة",
        description: e?.message || "خطأ غير معروف",
      });
    },
  });
}