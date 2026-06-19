import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download, DollarSign, TrendingDown, Wallet, Users, Loader2, Eye, CheckCircle2, ClipboardEdit, Play, Zap, Layers, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import MalakiPayslipDialog from "@/components/hr/MalakiPayslipDialog";
import { calculateMalakiPayslip, fmtCurrency, type MalakiEmployee, type MalakiMonthInput, type MalakiPayslip } from "@/lib/malaki-payroll";
// ─── Standard Engine (Targeted Switch — Lemon & Mint pilot only) ─────
// Routing rule: if employee.payroll_policy_id exists AND policy.engine_preset === 'standard'
// → use Standard preset; otherwise fallback to Malaki. NO global change.
import { calculateStandardPreset, type StandardComponent } from "@/lib/payroll-engine/presets/standard";
import type { PayrollEmployeeData, PayrollMonthInputs, PayrollPolicy as EnginePayrollPolicy } from "@/lib/payroll-engine/types";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";
import PayrollEmployeeDrawer from "@/pages/hr/components/PayrollEmployeeDrawer";
import PayrollImportDialog from "@/components/hr/PayrollImportDialog";

import { setNextExportBranding } from "@/lib/excel-export";
const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const normalizeArabic = (s: string) => s.replace(/\s+/g, "").replace(/ة/g, "ه").replace(/أ|إ|آ/g, "ا");

const PayrollPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [slipOpen, setSlipOpen] = useState(false);
  const [selectedSlipData, setSelectedSlipData] = useState<{ slip: MalakiPayslip; emp: any } | null>(null);
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [drawerEmployeeId, setDrawerEmployeeId] = useState<string | null>(null);
  const [drawerRecord, setDrawerRecord] = useState<any | null>(null);
  const [drawerEmpName, setDrawerEmpName] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);

  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["payroll-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("is_active", true).order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payrollRecords, isLoading: loadingPayroll } = useQuery({
    queryKey: ["payroll-records", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payroll")
        .select("*, employees(full_name, department, job_title)")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: monthInputs } = useQuery({
    queryKey: ["payroll-inputs", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_payroll_inputs")
        .select("*")
        .eq("year", selectedYear)
        .eq("month", selectedMonth);
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    if (!payrollRecords?.length) return { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 };
    return payrollRecords.reduce((acc: any, p: any) => ({
      totalBase: acc.totalBase + Number(p.attendance_salary || p.base_salary || 0),
      totalAllowances: acc.totalAllowances + Number(p.total_allowances),
      totalDeductions: acc.totalDeductions + Number(p.total_deductions),
      totalNet: acc.totalNet + Number(p.net_salary),
      count: acc.count + 1,
      paidCount: acc.paidCount + (p.is_paid ? 1 : 0),
    }), { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 });
  }, [payrollRecords]);

  // Employees not yet processed this month
  const unprocessedEmployees = useMemo(() => {
    if (!employees) return [];
    const processedIds = new Set((payrollRecords || []).map((p: any) => p.employee_id));
    return employees.filter((e: any) => !processedIds.has(e.id));
  }, [employees, payrollRecords]);

  const toMalakiEmp = (emp: any): MalakiEmployee => ({
    id: emp.id,
    full_name: emp.full_name,
    start_date: emp.start_date,
    hourly_rate: Number(emp.hourly_rate) || 9.6,
    base_salary: Number(emp.base_salary) || 0,
    admin_allowance: Number(emp.admin_allowance) || 0,
    transfer_allowance: Number(emp.transfer_allowance) || 0,
    food_transport_override: emp.food_transport_override != null ? Number(emp.food_transport_override) : null,
    wives_count: Number(emp.wives_count) || 0,
    children_count: Number(emp.children_count) || 0,
    other_allowances: Number(emp.other_allowances) || 0,
    special_work_allowance: Number(emp.special_work_allowance) || 0,
    annual_leave_balance: Number(emp.annual_leave_balance) || 0,
    annual_leave_days: Number(emp.annual_leave_days) || 14,
    is_terminated: emp.is_terminated || false,
    terminated_at: emp.terminated_at,
  });

  // ━━━ ONE-CLICK FULL PAYROLL RUN ━━━
  const handleAutoRunPayroll = async () => {
    if (!user || !employees?.length) return;
    setRunningPayroll(true);
    
    try {
      const targetEmployees = unprocessedEmployees;
      if (!targetEmployees.length) {
        toast.info("جميع الموظفين تم احتساب رواتبهم لهذا الشهر");
        setRunningPayroll(false);
        return;
      }

      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];

      // Fetch all data in parallel
      const [attendanceRes, prevPayrollRes, loanInstRes, txRes, empAccountsRes, vouchersRes, existingInputsRes] = await Promise.all([
        // 1. Attendance data
        supabase.from("attendance_days")
          .select("employee_id, total_hours, overtime_hours, status")
          .gte("attendance_date", startDate)
          .lte("attendance_date", endDate),
        // 2. Previous month carry-over
        (() => {
          const pm = selectedMonth === 1 ? 12 : selectedMonth - 1;
          const py = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
          return supabase.from("employee_payroll")
            .select("employee_id, carry_over_balance, net_salary")
            .eq("period_month", pm)
            .eq("period_year", py);
        })(),
        // 3. Loan installments for this month
        supabase.from("loan_installments" as any)
          .select("employee_id, installment_amount, status")
          .eq("payroll_month", selectedMonth)
          .eq("payroll_year", selectedYear)
          .eq("status", "pending"),
        // 4. Transactions on employee accounts (2180+)
        supabase.from("transactions")
          .select("debit_account_code, credit_account_code, amount, description")
          .gte("transaction_date", startDate)
          .lte("transaction_date", endDate)
          .or("debit_account_code.like.218%,credit_account_code.like.218%")
          .eq("is_deleted", false),
        // 5. Employee account mappings
        supabase.from("accounts")
          .select("account_code, account_name")
          .eq("parent_code", "2180")
          .eq("is_active", true),
        // 6. Payment vouchers to employees
        supabase.from("vouchers")
          .select("amount, description, date")
          .eq("type", "payment")
          .gte("date", startDate)
          .lte("date", endDate),
        // 7. Existing manual inputs (if any)
        supabase.from("monthly_payroll_inputs")
          .select("*")
          .eq("year", selectedYear)
          .eq("month", selectedMonth),
      ]);

      // ─── Standard Engine: load policies + components for any linked employees ───
      // Targeted, additive read — no impact on Malaki path.
      const linkedPolicyIds = Array.from(
        new Set(targetEmployees.map((e: any) => e.payroll_policy_id).filter(Boolean))
      );
      const policiesById: Record<string, any> = {};
      const componentsByPolicy: Record<string, StandardComponent[]> = {};
      if (linkedPolicyIds.length > 0) {
        const [polRes, compRes] = await Promise.all([
          supabase.from("hr_payroll_policies").select("*").in("id", linkedPolicyIds),
          supabase.from("hr_payroll_components").select("*").in("policy_id", linkedPolicyIds).eq("is_active", true).order("sort_order"),
        ]);
        for (const p of (polRes.data || [])) policiesById[p.id] = p;
        for (const c of (compRes.data || [])) {
          (componentsByPolicy[c.policy_id] ||= []).push({
            id: c.id,
            code: c.code,
            name_ar: c.name_ar,
            kind: c.kind as 'allowance' | 'deduction',
            calculation_type: c.calculation_type as string,
            value: Number(c.value || 0),
            formula_expression: c.formula_expression,
            is_attendance_linked: !!c.is_attendance_linked,
            is_active: !!c.is_active,
          });
        }
      }
      const engineDebug: Array<{ name: string; engine: 'Standard' | 'Malaki'; warnings?: string[] }> = [];

      // ━━━ 1. Aggregate Attendance ━━━
      const attData = attendanceRes.data || [];
      const empAtt: Record<string, { days: number; hours: number; overtime: number; vacHours: number; annual: number; sick: number }> = {};
      for (const rec of attData) {
        if (!empAtt[rec.employee_id]) empAtt[rec.employee_id] = { days: 0, hours: 0, overtime: 0, vacHours: 0, annual: 0, sick: 0 };
        const a = empAtt[rec.employee_id];
        if (rec.status === "present" || rec.status === "حاضر") {
          a.days++;
          a.hours += Number(rec.total_hours) || 0;
          a.overtime += Number(rec.overtime_hours) || 0;
        } else if (rec.status === "annual_leave" || rec.status === "إجازة سنوية") {
          a.annual++;
        } else if (rec.status === "sick_leave" || rec.status === "إجازة مرضية") {
          a.sick++;
        } else if (rec.status === "vacation" || rec.status === "إجازة") {
          a.vacHours += Number(rec.total_hours) || 0;
        }
      }

      // ━━━ 2. Previous month carry-over ━━━
      const prevPayroll = prevPayrollRes.data || [];
      const carryOver: Record<string, number> = {};
      for (const p of prevPayroll) {
        const co = Number(p.carry_over_balance) || 0;
        if (co > 0) carryOver[p.employee_id] = co;
      }

      // ━━━ 3. Loan installments ━━━
      const loanInst = loanInstRes.data || [];
      const loanByEmp: Record<string, number> = {};
      for (const li of loanInst as any[]) {
        loanByEmp[li.employee_id] = (loanByEmp[li.employee_id] || 0) + Number(li.installment_amount);
      }

      // ━━━ 4. Deductions from transactions/vouchers ━━━
      const accountCodeToEmpId: Record<string, string> = {};
      const empAccounts = empAccountsRes.data || [];
      for (const acc of empAccounts) {
        const match = acc.account_name.match(/ذمم موظف\s*[-–]\s*(.+)/);
        if (match) {
          const accName = normalizeArabic(match[1].trim());
          for (const emp of targetEmployees) {
            if (normalizeArabic(emp.full_name).includes(accName) || accName.includes(normalizeArabic(emp.full_name))) {
              accountCodeToEmpId[acc.account_code] = emp.id;
              break;
            }
          }
        }
      }

      const txDeductions: Record<string, number> = {};
      for (const tx of (txRes.data || [])) {
        // Skip loan disbursement transactions — loans are handled via loan_installments table
        const desc = (tx.description || "").toLowerCase();
        if (desc.includes("قرض حسن") || desc.includes("قرض ") || desc.includes("loan")) continue;

        const code = tx.debit_account_code?.startsWith("118") ? tx.debit_account_code : tx.credit_account_code;
        const empId = accountCodeToEmpId[code || ""];
        if (empId) {
          txDeductions[empId] = (txDeductions[empId] || 0) + Number(tx.amount);
        }
      }

      // ━━━ 5. Existing manual inputs (merge) ━━━
      const manualInputs: Record<string, any> = {};
      for (const inp of (existingInputsRes.data || [])) {
        manualInputs[inp.employee_id] = inp;
      }

      // ━━━ Build payroll records ━━━
      const records: any[] = [];
      const inputRecords: any[] = [];

      for (const emp of targetEmployees) {
        const malakiEmp = toMalakiEmp(emp);
        const att = empAtt[emp.id] || { days: 0, hours: 0, overtime: 0, vacHours: 0, annual: 0, sick: 0 };
        const manual = manualInputs[emp.id];

        const malakiInput: MalakiMonthInput = {
          working_days: att.days || (manual?.working_days || 0),
          working_hours: Math.round((att.hours || (manual?.working_hours || 0)) * 100) / 100,
          overtime_hours: Math.round((att.overtime || (manual?.overtime_hours || 0)) * 100) / 100,
          holiday_overtime_hours: manual?.holiday_overtime_hours || 0,
          vacation_hours: Math.round((att.vacHours || (manual?.vacation_hours || 0)) * 100) / 100,
          annual_leave_days: att.annual || (manual?.annual_leave_days || 0),
          sick_leave_days: att.sick || (manual?.sick_leave_days || 0),
          opening_advance_balance: carryOver[emp.id] || (manual?.opening_advance_balance || 0),
          loan_installment: loanByEmp[emp.id] || (manual?.loan_installment || 0),
          new_advance: manual?.new_advance || 0,
          cash_advances: txDeductions[emp.id] || (manual?.cash_advances || 0),
          food_total: manual?.food_total || 0,
          food_individual: manual?.food_individual || 0,
          cash_shortage: manual?.cash_shortage || 0,
          cash_surplus: manual?.cash_surplus || 0,
          delivery: manual?.delivery || 0,
          purchases: manual?.purchases || 0,
          other_deduction: manual?.other_deduction || 0,
          violations: manual?.violations || 0,
          deduction_notes: manual?.deduction_notes || "",
          special_allowance: manual?.special_allowance || 0,
          extra_work_allowance: manual?.extra_work_allowance || 0,
          has_termination_pay: manual?.has_termination_pay || false,
        };

        // ─── Targeted Engine Switch ───
        // Standard preset only when employee is linked AND policy.engine_preset='standard'.
        // Otherwise → Malaki (unchanged behaviour for everyone else).
        const linkedPolicy = emp.payroll_policy_id ? policiesById[emp.payroll_policy_id] : null;
        const useStandard = !!linkedPolicy && linkedPolicy.engine_preset === 'standard';

        let slip: MalakiPayslip;
        if (useStandard) {
          const stdEmp: PayrollEmployeeData = {
            id: emp.id,
            full_name: emp.full_name,
            start_date: emp.start_date,
            hourly_rate: Number(emp.hourly_rate) || 0,
            base_salary: Number(emp.base_salary) || 0,
            admin_allowance: Number(emp.admin_allowance) || 0,
            transfer_allowance: Number(emp.transfer_allowance) || 0,
            food_transport_override: emp.food_transport_override != null ? Number(emp.food_transport_override) : null,
            wives_count: Number(emp.wives_count) || 0,
            children_count: Number(emp.children_count) || 0,
            other_allowances: Number(emp.other_allowances) || 0,
            special_work_allowance: Number(emp.special_work_allowance) || 0,
            annual_leave_balance: Number(emp.annual_leave_balance) || 0,
            annual_leave_days: Number(emp.annual_leave_days) || 0,
            is_terminated: !!emp.is_terminated,
            terminated_at: emp.terminated_at,
          };
          // Apply per-employee overrides on component values (read-only, in-memory).
          const overrides = (emp.payroll_overrides ?? {}) as Record<string, number>;
          const baseComps = componentsByPolicy[linkedPolicy.id] || [];
          const comps: StandardComponent[] = baseComps.map((c) => ({
            ...c,
            value: overrides[c.code] != null ? Number(overrides[c.code]) : c.value,
          }));
          const stdPolicy: EnginePayrollPolicy = {
            id: linkedPolicy.id,
            company_id: linkedPolicy.company_id,
            name: linkedPolicy.name,
            preset: 'standard',
            salary_basis: linkedPolicy.salary_basis,
            month_days_mode: linkedPolicy.month_days_mode,
            month_days_custom: linkedPolicy.month_days_custom ?? 0,
            daily_work_hours: Number(linkedPolicy.daily_work_hours) || 8,
            overtime_multiplier: Number(linkedPolicy.overtime_multiplier) || 1.5,
            overtime_after_hours: Number(linkedPolicy.overtime_after_hours) || 0,
            absence_calculation: linkedPolicy.absence_calculation || '',
            late_calculation: linkedPolicy.late_calculation || '',
            late_grace_minutes: Number(linkedPolicy.late_grace_minutes) || 0,
            late_per_minute_rate: Number(linkedPolicy.late_per_minute_rate) || 0,
            allowances_attendance_linked: !!linkedPolicy.allowances_attendance_linked,
            deductions_mode: linkedPolicy.deductions_mode || '',
            is_default: !!linkedPolicy.is_default,
          };
          const stdInput: PayrollMonthInputs = malakiInput as unknown as PayrollMonthInputs;
          const stdResult = calculateStandardPreset(
            stdEmp,
            stdInput,
            { year: selectedYear, month: selectedMonth },
            stdPolicy,
            { components: comps }
          );
          slip = stdResult as unknown as MalakiPayslip;
          engineDebug.push({ name: emp.full_name, engine: 'Standard', warnings: stdResult._engine.warnings });
        } else {
          slip = calculateMalakiPayslip(malakiEmp, malakiInput, selectedYear, selectedMonth);
          engineDebug.push({ name: emp.full_name, engine: 'Malaki' });
        }

        records.push({
          user_id: user.id,
          employee_id: emp.id,
          company_id: emp.company_id || null,
          period_month: selectedMonth,
          period_year: selectedYear,
          base_salary: slip.attendance_salary,
          attendance_salary: slip.attendance_salary,
          total_allowances: slip.net_fixed + slip.attendance_bonus + slip.special_allowance + slip.extra_work_allowance + slip.entitlements,
          total_deductions: slip.total_deductions,
          total_overtime: slip.overtime_hours * (malakiEmp.hourly_rate || 9.6) * 0.5,
          net_salary: slip.net_salary,
          is_paid: false,
          regular_hours: slip.regular_hours,
          overtime_hours_val: slip.overtime_hours,
          vacation_hours_paid: slip.vacation_hours,
          annual_allowance: slip.annual_allowance,
          admin_allowance: slip.admin_allowance,
          food_transport_net: slip.food_transport_net,
          family_allowance: slip.family_allowance,
          other_allowances_val: slip.other_allowances,
          attendance_bonus: slip.attendance_bonus,
          special_allowance: slip.special_allowance,
          extra_work_allowance: slip.extra_work_allowance,
          entitlements: slip.entitlements,
          deduction_opening_balance: slip.deduction_opening_balance,
          deduction_loan: slip.deduction_loan,
          deduction_new_advance: slip.deduction_new_advance,
          deduction_cash_advance: slip.deduction_cash_advance,
          deduction_food_group: slip.deduction_food_group,
          deduction_food_individual: slip.deduction_food_individual,
          deduction_cash_shortage: slip.deduction_cash_shortage,
          deduction_delivery: slip.deduction_delivery,
          deduction_purchases: slip.deduction_purchases,
          deduction_other: slip.deduction_other,
          deduction_violations: slip.deduction_violations,
          deduction_fixed_component: slip.fixed_deduction,
          carry_over_balance: slip.carry_over_balance,
          working_days: slip.working_days,
        });

        // Also save the auto-generated input for reference
        inputRecords.push({
          employee_id: emp.id,
          company_id: emp.company_id || null,
          year: selectedYear,
          month: selectedMonth,
          created_by: user.id,
          ...malakiInput,
        });
      }

      // Save inputs + payroll in parallel
      const [payrollErr, inputErr] = await Promise.all([
        supabase.from("employee_payroll").insert(records).then(r => r.error),
        supabase.from("monthly_payroll_inputs").upsert(inputRecords, { onConflict: "employee_id,year,month" }).then(r => r.error),
      ]);

      if (payrollErr) throw payrollErr;
      if (inputErr) console.warn("Input save warning:", inputErr.message);

      // Mark loan installments as deducted
      if (loanInst.length > 0) {
        const loanInstIds = (loanInst as any[]).map((l: any) => l.id);
        await supabase.from("loan_installments" as any)
          .update({ status: "paid", paid_date: new Date().toISOString().split("T")[0] } as any)
          .in("id", loanInstIds);
      }

      // ─── Engine usage summary (Targeted Switch debug) ───
      const stdCount = engineDebug.filter((d) => d.engine === 'Standard').length;
      const malCount = engineDebug.length - stdCount;
      console.table(engineDebug);
      toast.success(
        `تم احتساب رواتب ${records.length} موظف — Standard: ${stdCount} · Malaki: ${malCount}`
      );
      const allWarnings = engineDebug
        .filter((d) => d.warnings && d.warnings.length)
        .flatMap((d) => d.warnings!.map((w) => `${d.name}: ${w}`));
      if (allWarnings.length) {
        console.warn('[Standard Engine Warnings]', allWarnings);
        toast.warning(`${allWarnings.length} تحذير من المحرك — راجع الكونسول`);
      }
      queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-inputs"] });
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء تشغيل المسير");
      console.error("Payroll run error:", e);
    } finally {
      setRunningPayroll(false);
    }
  };
  const handleMarkPaid = async (id: string) => {
    const { error } = await supabase.from("employee_payroll").update({ is_paid: true, paid_date: new Date().toISOString().split("T")[0] }).eq("id", id);
    if (error) { toast.error("خطأ في التحديث"); return; }
    toast.success("تم تحديث حالة الدفع");
    queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
  };

  const openWorkspace = (record: any) => {
    setDrawerEmployeeId(record.employee_id);
    setDrawerRecord(record);
    setDrawerEmpName(record.employees?.full_name || "موظف");
  };

  const openWorkspaceForEmployee = (emp: any) => {
    setDrawerEmployeeId(emp.id);
    setDrawerRecord(null);
    setDrawerEmpName(emp.full_name || "موظف");
  };

  const closeDrawer = () => {
    setDrawerEmployeeId(null);
    setDrawerRecord(null);
    setDrawerEmpName("");
  };

  const handleApproveFromDrawer = async (recordId: string) => {
    // Find the record being approved to build the immutable snapshot
    const record = (payrollRecords as any[] | undefined)?.find((r) => r.id === recordId) || drawerRecord;
    if (!record) {
      await handleMarkPaid(recordId);
      closeDrawer();
      return;
    }

    // Build approval snapshot — frozen values at the moment of approval
    const snapshot = {
      version: 1,
      approved_at: new Date().toISOString(),
      approved_by: user?.id || null,
      approved_by_email: user?.email || null,
      net_salary: Number(record.net_salary || 0),
      attendance_salary: Number(record.attendance_salary || record.base_salary || 0),
      total_allowances: Number(record.total_allowances || 0),
      total_deductions: Number(record.total_deductions || 0),
      total_overtime: Number(record.total_overtime || 0),
      working_days: Number(record.working_days || 0),
      regular_hours: Number(record.regular_hours || 0),
      overtime_hours_val: Number(record.overtime_hours_val || 0),
      vacation_hours_paid: Number(record.vacation_hours_paid || 0),
      carry_over_balance: Number(record.carry_over_balance || 0),
      period_month: record.period_month,
      period_year: record.period_year,
    };

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("employee_payroll")
      .update({
        is_paid: true,
        paid_date: nowIso.split("T")[0],
        approved_by: user?.id || null,
        approved_at: nowIso,
        approval_snapshot: snapshot,
      })
      .eq("id", recordId);

    if (error) {
      toast.error("خطأ في الاعتماد");
      return;
    }
    toast.success("تم اعتماد الراتب وتجميد القيم");
    queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
    closeDrawer();
  };

  const handleViewSlip = (record: any) => {
    const emp = employees?.find((e: any) => e.id === record.employee_id);
    if (!emp) return;

    // Reconstruct payslip from stored detailed data
    const slip: MalakiPayslip = {
      working_days: record.working_days || 0,
      regular_hours: Number(record.regular_hours) || 0,
      overtime_hours: Number(record.overtime_hours_val) || 0,
      vacation_hours: Number(record.vacation_hours_paid) || 0,
      annual_leave_days: 0,
      sick_leave_days: 0,
      attendance_salary: Number(record.attendance_salary) || 0,
      annual_allowance: Number(record.annual_allowance) || 0,
      admin_allowance: Number(record.admin_allowance) || 0,
      food_transport_base: 0,
      food_transport_net: Number(record.food_transport_net) || 0,
      family_allowance: Number(record.family_allowance) || 0,
      other_allowances: Number(record.other_allowances_val) || 0,
      gross_fixed: 0,
      fixed_deduction: Number(record.deduction_fixed_component) || 0,
      net_fixed: Number(record.food_transport_net || 0) + Number(record.annual_allowance || 0) + Number(record.admin_allowance || 0) + Number(record.family_allowance || 0) + Number(record.other_allowances_val || 0) - Number(record.deduction_fixed_component || 0),
      attendance_bonus: Number(record.attendance_bonus) || 0,
      special_allowance: Number(record.special_allowance) || 0,
      extra_work_allowance: Number(record.extra_work_allowance) || 0,
      entitlements: Number(record.entitlements) || 0,
      total_earnings: Number(record.attendance_salary || 0) + Number(record.total_allowances || 0),
      deduction_opening_balance: Number(record.deduction_opening_balance) || 0,
      deduction_loan: Number(record.deduction_loan) || 0,
      deduction_new_advance: Number(record.deduction_new_advance) || 0,
      deduction_cash_advance: Number(record.deduction_cash_advance) || 0,
      deduction_food_group: Number(record.deduction_food_group) || 0,
      deduction_food_individual: Number(record.deduction_food_individual) || 0,
      deduction_cash_shortage: Number(record.deduction_cash_shortage) || 0,
      deduction_cash_surplus: 0,
      deduction_delivery: Number(record.deduction_delivery) || 0,
      deduction_purchases: Number(record.deduction_purchases) || 0,
      deduction_other: Number(record.deduction_other) || 0,
      deduction_violations: Number(record.deduction_violations) || 0,
      total_deductions: Number(record.total_deductions) || 0,
      net_salary: Number(record.net_salary) || 0,
      carry_over_balance: Number(record.carry_over_balance) || 0,
    };

    setSelectedSlipData({ slip, emp });
    setSlipOpen(true);
  };

  const filtered = useMemo(() => {
    if (!payrollRecords) return [];
    if (!search) return payrollRecords;
    return payrollRecords.filter((p: any) =>
      p.employees?.full_name?.includes(search) || p.employees?.department?.includes(search)
    );
  }, [payrollRecords, search]);

  const exportExcel = () => {
    if (!payrollRecords?.length) return;
    const rows = payrollRecords.map((p: any) => ({
      "الموظف": p.employees?.full_name || "-",
      "القسم": p.employees?.department || "-",
      "راتب البصمة": Number(p.attendance_salary || p.base_salary || 0),
      "البدلات": Number(p.total_allowances),
      "الخصومات": Number(p.total_deductions),
      "الصافي": Number(p.net_salary),
      "الحالة": p.is_paid ? "مدفوع" : "غير مدفوع",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الرواتب");
    setNextExportBranding({ title: "الرواتب" });
    XLSX.writeFile(wb, `رواتب_${months[selectedMonth - 1]}_${selectedYear}.xlsx`);
  };

  const isLoading = loadingEmp || loadingPayroll;
  

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">إدارة الرواتب</h1>
            <p className="text-xs text-muted-foreground">{months[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/payroll/preview-all")}>
            <Eye className="h-4 w-4 ml-1" /> معاينة كل الرواتب
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/payroll/inputs")}>
            <ClipboardEdit className="h-4 w-4 ml-1" /> إدخال البيانات
          </Button>
          {unprocessedEmployees.length > 0 && (
            <Button onClick={handleAutoRunPayroll} disabled={runningPayroll} size="sm" className="bg-primary">
              {runningPayroll ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Zap className="h-4 w-4 ml-1" />}
              احتساب الرواتب تلقائياً ({unprocessedEmployees.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!payrollRecords?.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10">
            <FileSpreadsheet className="h-4 w-4 ml-1" /> استيراد كشف Excel
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="بحث بالاسم أو القسم..." value={search} onChange={e => setSearch(e.target.value)} className="w-[200px]" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "عدد الموظفين", value: String(summary.count), icon: Users, color: "text-blue-500" },
          { label: "راتب البصمة", value: fmtCurrency(summary.totalBase), icon: DollarSign, color: "text-blue-500" },
          { label: "إجمالي البدلات", value: fmtCurrency(summary.totalAllowances), icon: TrendingDown, color: "text-emerald-500" },
          { label: "إجمالي الخصومات", value: fmtCurrency(summary.totalDeductions), icon: TrendingDown, color: "text-red-500" },
          { label: "صافي الرواتب", value: fmtCurrency(summary.totalNet), icon: Wallet, color: "text-primary" },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      {unprocessedEmployees.length > 0 && !isLoading && (
        <Card className="p-3 border-blue-300 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
              <Zap className="h-4 w-4" />
              <span>{unprocessedEmployees.length} موظف جاهز — اضغط "احتساب الرواتب تلقائياً" لحساب البصمة والخصومات والقروض دفعة واحدة</span>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">راتب البصمة</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">البدلات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الخصومات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الصافي</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">الحالة</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />جاري التحميل...
                </td></tr>
              ) : !filtered?.length ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                  لا توجد بيانات رواتب لهذه الفترة
                </td></tr>
              ) : (
                <>
                  {filtered.map((p: any) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-colors"
                      onClick={() => openWorkspace(p)}
                    >
                      <td className="p-3 font-medium text-foreground">
                        <span className="hover:text-primary inline-flex items-center gap-1.5">
                          <Layers className="h-3 w-3 text-muted-foreground" />
                          {p.employees?.full_name || "-"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{p.employees?.department || "-"}</td>
                      <td className="p-3">{fmtCurrency(Number(p.attendance_salary || p.base_salary || 0))}</td>
                      <td className="p-3 text-emerald-600">{fmtCurrency(Number(p.total_allowances))}</td>
                      <td className="p-3 text-red-500">{fmtCurrency(Number(p.total_deductions))}</td>
                      <td className={`p-3 font-bold ${Number(p.net_salary) < 0 ? "text-red-500" : ""}`}>{fmtCurrency(Number(p.net_salary))}</td>
                      <td className="p-3 text-center">
                        <Badge variant={p.is_paid ? "default" : "secondary"} className={`text-[10px] ${p.is_paid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                          {p.is_paid ? "مدفوع" : "غير مدفوع"}
                        </Badge>
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => openWorkspace(p)} title="ملف الراتب الشامل">
                            <Layers className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewSlip(p)} title="قسيمة الراتب">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!p.is_paid && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleMarkPaid(p.id)} title="تحديد كمدفوع">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="p-3" colSpan={2}>الإجمالي ({summary.count} موظف — {summary.paidCount} مدفوع)</td>
                    <td className="p-3">{fmtCurrency(summary.totalBase)}</td>
                    <td className="p-3 text-emerald-600">{fmtCurrency(summary.totalAllowances)}</td>
                    <td className="p-3 text-red-500">{fmtCurrency(summary.totalDeductions)}</td>
                    <td className="p-3">{fmtCurrency(summary.totalNet)}</td>
                    <td className="p-3" colSpan={2}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedSlipData && (
        <MalakiPayslipDialog
          open={slipOpen}
          onClose={() => { setSlipOpen(false); setSelectedSlipData(null); }}
          slip={selectedSlipData.slip}
          employee={selectedSlipData.emp}
          month={selectedMonth}
          year={selectedYear}
        />
      )}

      <PayrollEmployeeDrawer
        open={!!drawerEmployeeId}
        onClose={closeDrawer}
        employeeId={drawerEmployeeId}
        employeeName={drawerEmpName}
        payrollRecord={drawerRecord}
        month={selectedMonth}
        year={selectedYear}
        onApprovePayment={handleApproveFromDrawer}
        onViewPayslip={(rec) => {
          handleViewSlip(rec);
        }}
      />
      <PayrollImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
        }}
      />
    </div>
  );
};

export default PayrollPage;
