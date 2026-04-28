import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * usePayrollPreview (B2.3 — Read-Only)
 * ------------------------------------------------------------------
 * Computes a NON-BINDING estimated payroll for an employee for a given
 * (year, month) period. **Strictly preview**: never mutates payroll,
 * never creates journal entries, never touches employee_payroll.
 *
 * Sources:
 *   - employees + work_shifts (for late/early/overtime calculation)
 *   - attendance_days (period scoped) + hr_attendance_locks (open/closed flag)
 *   - employee_loans + loan_installments (due in period)
 *   - employee_deductions (period scoped)
 *   - employee_financial_movements (categorized: previous_balance, advance, meal, transport, store_purchase, settlement, violation, uncategorized)
 *   - transactions (party=employee, payments) → optional refs
 *   - payroll_settings (rate, overtime multiplier, base_month_days)
 *
 * Output: structured breakdown ready for UI rendering.
 */

export type PreviewLineItem = {
  id: string;
  label: string;
  category: string;
  amount: number;            // positive numbers; sign is implied by section
  date?: string | null;
  reference?: string | null;
  note?: string | null;
  meta?: Record<string, any>;
  // --- Reconciliation (B2.4): each line is traceable back to its origin ---
  sourceKind?:
    | "transaction"
    | "financial_movement"
    | "loan_installment"
    | "loan"
    | "manual_deduction"
    | "attendance"
    | "previous_balance"
    | "computed";
  sourceId?: string | null;
  sourceLabel?: string | null; // e.g. "سند صرف PV-001"
  sourceTable?: string | null; // for debug / dev
};

export type PayrollPreviewResult = {
  period: { year: number; month: number; start: string; end: string };
  employee: {
    id: string;
    full_name: string;
    base_salary: number;
    hourly_rate: number;
    work_hours_per_day: number;
    base_month_days: number;
    overtime_multiplier: number;
  };
  attendance: {
    workingDays: number;
    presentDays: number;
    lateDays: number;
    absentDays: number;
    incompleteDays: number;
    totalLateMinutes: number;
    totalEarlyLeaveMinutes: number;
    totalOvertimeMinutes: number;
    openDays: string[];        // dates within period that are NOT locked
    lockedDays: string[];      // dates within period that are locked
    hasOpenDays: boolean;
  };
  additions: {
    overtimeAmount: number;
    items: PreviewLineItem[];
    total: number;
  };
  attendanceDeductions: {
    lateAmount: number;
    earlyLeaveAmount: number;
    absentAmount: number;
    items: PreviewLineItem[];
    total: number;
  };
  financialDeductions: {
    previousBalance: PreviewLineItem[];
    advances: PreviewLineItem[];
    loans: PreviewLineItem[];
    meals: PreviewLineItem[];
    transport: PreviewLineItem[];
    violations: PreviewLineItem[];
    storePurchases: PreviewLineItem[];
    settlement: PreviewLineItem[];
    uncategorized: PreviewLineItem[];
    total: number;
  };
  baseSalary: number;
  totalAdditions: number;
  totalDeductions: number;
  netEstimated: number;
  isPreviewOnly: true;
  warnings: string[];
};

const num = (v: any) => Number(v || 0);

function monthBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0); // last day of month
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end, daysInMonth: endDate.getDate() };
}

function resolveShift(emp: any) {
  const sh = emp?.shift;
  if (sh?.start_time && sh?.end_time) {
    return {
      start: String(sh.start_time).slice(0, 5),
      end: String(sh.end_time).slice(0, 5),
      graceMin: num(sh.late_tolerance_minutes),
      overtimeAfterMin: num(sh.overtime_after_minutes),
      crossesMidnight: !!sh.crosses_midnight,
    };
  }
  return {
    start: emp?.shift_start || null,
    end: emp?.shift_end || null,
    graceMin: 0,
    overtimeAfterMin: 0,
    crossesMidnight: false,
  };
}

function computeDayMinutes(day: any, shift: ReturnType<typeof resolveShift>) {
  const out = { lateMin: 0, earlyLeaveMin: 0, overtimeMin: 0 };
  if (!shift.start || !shift.end) return out;
  const anchor = day.first_check_in
    ? new Date(day.first_check_in)
    : day.last_check_out
    ? new Date(day.last_check_out)
    : null;
  if (!anchor) return out;

  const [sh1, sm1] = shift.start.split(":").map(Number);
  const expectedStart = new Date(anchor);
  expectedStart.setHours(sh1 || 0, sm1 || 0, 0, 0);

  const [eh, em] = shift.end.split(":").map(Number);
  const expectedEnd = new Date(anchor);
  expectedEnd.setHours(eh || 0, em || 0, 0, 0);
  if (shift.crossesMidnight) expectedEnd.setDate(expectedEnd.getDate() + 1);

  if (day.first_check_in) {
    const ci = new Date(day.first_check_in);
    let late = Math.max(0, Math.round((ci.getTime() - expectedStart.getTime()) / 60000));
    if (late <= shift.graceMin) late = 0;
    out.lateMin = late;
  }
  if (day.last_check_out) {
    const co = new Date(day.last_check_out);
    out.earlyLeaveMin = Math.max(0, Math.round((expectedEnd.getTime() - co.getTime()) / 60000));
    const extra = Math.max(0, Math.round((co.getTime() - expectedEnd.getTime()) / 60000));
    if (extra >= shift.overtimeAfterMin) out.overtimeMin = extra;
  }
  return out;
}

/**
 * Categorize a financial movement based on source_type / description heuristics.
 * Heuristics are conservative — anything unknown lands in "uncategorized" so HR can review.
 */
function categorizeMovement(m: any): string {
  const src = String(m.source_type || "").toLowerCase();
  const desc = String(m.description || "").toLowerCase();
  if (src.includes("meal") || src === "pos_meal" || desc.includes("اكل") || desc.includes("وجب")) return "meal";
  if (src.includes("transport") || desc.includes("مواصلات")) return "transport";
  if (src.includes("advance") || desc.includes("سلف")) return "advance";
  if (src.includes("loan") || desc.includes("قرض")) return "loan";
  if (src.includes("violation") || src.includes("penalty") || desc.includes("مخالف") || desc.includes("عقاب")) return "violation";
  if (src.includes("store") || src.includes("purchase") || desc.includes("مشتريات")) return "store_purchase";
  if (src.includes("settlement") || desc.includes("عجز") || desc.includes("فائض") || desc.includes("تسوي")) return "settlement";
  if (src.includes("opening") || src.includes("previous") || desc.includes("رصيد سابق")) return "previous_balance";
  return "uncategorized";
}

export function usePayrollPreview(
  employeeId: string | undefined,
  year: number,
  month: number,
) {
  return useQuery<PayrollPreviewResult>({
    queryKey: ["payroll-preview", employeeId, year, month],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!employeeId) throw new Error("employeeId is required");
      const { start, end, daysInMonth } = monthBounds(year, month);

      // Employee + shift
      const { data: employee, error: empErr } = await (supabase as any)
        .from("employees")
        .select(
          "id, full_name, company_id, auth_user_id, base_salary, hourly_rate, work_hours_per_day, work_days_per_week, shift_start, shift_end, shift_id, branch_id, shift:work_shifts(id,name,start_time,end_time,late_tolerance_minutes,overtime_after_minutes,crosses_midnight)",
        )
        .eq("id", employeeId)
        .maybeSingle();
      if (empErr) throw empErr;
      if (!employee) throw new Error("Employee not found");

      // Settings
      const { data: settings } = employee.company_id
        ? await supabase
            .from("payroll_settings")
            .select("*")
            .eq("company_id", employee.company_id)
            .maybeSingle()
        : ({ data: null } as any);

      // Parallel period reads
      const [daysRes, locksRes, deductionsRes, finMovesRes, loansRes, txRes] =
        await Promise.all([
          supabase
            .from("attendance_days")
            .select("*")
            .eq("employee_id", employeeId)
            .gte("attendance_date", start)
            .lte("attendance_date", end)
            .order("attendance_date", { ascending: true }),
          supabase
            .from("hr_attendance_locks")
            .select("attendance_date, status, branch_id")
            .eq("auth_user_id", employee.auth_user_id || "00000000-0000-0000-0000-000000000000")
            .gte("attendance_date", start)
            .lte("attendance_date", end),
          supabase
            .from("employee_deductions")
            .select("*")
            .eq("employee_id", employeeId)
            .gte("deduction_date", start)
            .lte("deduction_date", end),
          supabase
            .from("employee_financial_movements")
            .select("*")
            .eq("employee_id", employeeId)
            .gte("movement_date", start)
            .lte("movement_date", end)
            .order("movement_date", { ascending: true }),
          supabase
            .from("employee_loans")
            .select("id, monthly_installment, status, total_months, paid_months")
            .eq("employee_id", employeeId)
            .eq("status", "active"),
          (supabase as any)
            .from("transactions")
            .select("id, transaction_number, transaction_date, transaction_type, total_amount, description")
            .eq("party_type", "employee")
            .eq("party_id", employeeId)
            .gte("transaction_date", start)
            .lte("transaction_date", end),
        ]);

      // Loan installments due this period
      const loans = loansRes.data || [];
      const loanIds = loans.map((l: any) => l.id);
      let installmentsDue: any[] = [];
      if (loanIds.length > 0) {
        const { data } = await supabase
          .from("loan_installments")
          .select("*")
          .in("loan_id", loanIds)
          .eq("payroll_year", year)
          .eq("payroll_month", month);
        installmentsDue = data || [];
      }

      const days = daysRes.data || [];
      const locks = locksRes.data || [];
      const lockedSet = new Set(
        locks.filter((l: any) => l.status === "locked").map((l: any) => l.attendance_date),
      );

      // --- Build transaction lookup for cross-linking financial movements → voucher numbers ---
      const txList = (txRes.data as any[]) || [];
      const txById = new Map<string, any>();
      for (const t of txList) txById.set(t.id, t);
      const txTypeLabel = (t: any) => {
        const k = String(t.transaction_type || "").toLowerCase();
        if (k === "payment") return `سند صرف ${t.transaction_number || ""}`.trim();
        if (k === "receipt") return `سند قبض ${t.transaction_number || ""}`.trim();
        return `${t.transaction_number || "سند"}`.trim();
      };

      // --- Previous balance from previous month (carry-forward debt) ---
      // We read employee_financial_movements before period start to compute net carry.
      const { data: priorMoves } = await supabase
        .from("employee_financial_movements")
        .select("amount, movement_type, movement_date, description, source_reference")
        .eq("employee_id", employeeId)
        .lt("movement_date", start)
        .order("movement_date", { ascending: false })
        .limit(500);
      let priorBalance = 0; // positive = owed BY employee
      for (const m of priorMoves || []) {
        const sign = String(m.movement_type || "").toLowerCase() === "debit" ? 1 : -1;
        priorBalance += sign * num(m.amount);
      }

      // Period day list (every date in month) → open vs locked
      const allDates: string[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        allDates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      }
      const today = new Date().toISOString().split("T")[0];
      const elapsedDates = allDates.filter((d) => d <= today);
      const openDays = elapsedDates.filter((d) => !lockedSet.has(d));
      const lockedDays = elapsedDates.filter((d) => lockedSet.has(d));

      // Compensation basics
      const baseSalary = num(employee.base_salary);
      const baseMonthDays = num(settings?.base_month_days) || 26;
      const workHoursPerDay = num(employee.work_hours_per_day) || 8;
      const overtimeMultiplier = num(settings?.overtime_multiplier) || 1.5;
      const hourlyRate =
        num(employee.hourly_rate) ||
        num(settings?.default_hourly_rate) ||
        (baseSalary > 0 && workHoursPerDay > 0
          ? baseSalary / (baseMonthDays * workHoursPerDay)
          : 0);
      const dailyRate = baseSalary > 0 ? baseSalary / baseMonthDays : hourlyRate * workHoursPerDay;
      const minutelyRate = hourlyRate / 60;

      // Aggregate attendance
      const shift = resolveShift(employee);
      let totalLateMin = 0,
        totalEarlyLeaveMin = 0,
        totalOvertimeMin = 0;
      let presentDays = 0,
        lateDays = 0,
        absentDays = 0,
        incompleteDays = 0;

      for (const d of days) {
        const m = computeDayMinutes(d, shift);
        totalLateMin += m.lateMin;
        totalEarlyLeaveMin += m.earlyLeaveMin;
        totalOvertimeMin += m.overtimeMin;
        const status = String(d.status || "").toLowerCase();
        if (["present", "حاضر", "complete", "مكتمل"].includes(status)) presentDays++;
        if (["late", "متأخر"].includes(status)) lateDays++;
        if (["absent", "غائب"].includes(status)) absentDays++;
        if (["incomplete", "ناقص"].includes(status)) incompleteDays++;
      }

      // === Additions ===
      const overtimeAmount = totalOvertimeMin * minutelyRate * overtimeMultiplier;
      const additionItems: PreviewLineItem[] = [];
      if (overtimeAmount > 0) {
        additionItems.push({
          id: "ot",
          label: "ساعات إضافية",
          category: "overtime",
          amount: overtimeAmount,
          note: `${(totalOvertimeMin / 60).toFixed(2)} ساعة × ${overtimeMultiplier}x`,
          sourceKind: "computed",
          sourceLabel: "محسوب من سجل الحضور",
          sourceTable: "attendance_days",
        });
      }

      // === Attendance deductions ===
      const lateAmount = totalLateMin * minutelyRate;
      const earlyLeaveAmount = totalEarlyLeaveMin * minutelyRate;
      const absentAmount = absentDays * dailyRate;
      const attendanceItems: PreviewLineItem[] = [];
      if (lateAmount > 0) attendanceItems.push({ id: "att-late", label: "تأخير", category: "late", amount: lateAmount, note: `${totalLateMin} دقيقة`, sourceKind: "attendance", sourceLabel: "سجل الحضور — تأخير", sourceTable: "attendance_days" });
      if (earlyLeaveAmount > 0) attendanceItems.push({ id: "att-early", label: "انصراف مبكر", category: "early_leave", amount: earlyLeaveAmount, note: `${totalEarlyLeaveMin} دقيقة`, sourceKind: "attendance", sourceLabel: "سجل الحضور — انصراف مبكر", sourceTable: "attendance_days" });
      if (absentAmount > 0) attendanceItems.push({ id: "att-abs", label: "غياب", category: "absent", amount: absentAmount, note: `${absentDays} يوم × ₪${dailyRate.toFixed(2)}`, sourceKind: "attendance", sourceLabel: "سجل الحضور — غياب", sourceTable: "attendance_days" });

      // === Financial deductions ===
      const fin = {
        previous_balance: [] as PreviewLineItem[],
        advance: [] as PreviewLineItem[],
        loan: [] as PreviewLineItem[],
        meal: [] as PreviewLineItem[],
        transport: [] as PreviewLineItem[],
        violation: [] as PreviewLineItem[],
        store_purchase: [] as PreviewLineItem[],
        settlement: [] as PreviewLineItem[],
        uncategorized: [] as PreviewLineItem[],
      };

      // --- Previous month carry-forward (only if employee owes money) ---
      if (priorBalance > 0.01) {
        fin.previous_balance.push({
          id: "prev-bal",
          label: "رصيد سابق مستحق على الموظف",
          category: "previous_balance",
          amount: priorBalance,
          date: start,
          note: `محسوب من حركات قبل ${start}`,
          sourceKind: "previous_balance",
          sourceLabel: "كشف حساب الموظف",
          sourceTable: "employee_financial_movements",
        });
      }

      // From employee_deductions (HR-recorded)
      for (const d of deductionsRes.data || []) {
        const t = String(d.deduction_type || "").toLowerCase();
        const bucket: keyof typeof fin =
          t === "advance"
            ? "advance"
            : t === "loan"
            ? "loan"
            : t === "penalty" || t === "violation"
            ? "violation"
            : t === "meal" || t === "food"
            ? "meal"
            : t === "transport"
            ? "transport"
            : "uncategorized";
        fin[bucket].push({
          id: `ded-${d.id}`,
          label: d.description || d.deduction_type || "خصم",
          category: t || "manual",
          amount: num(d.amount),
          date: d.deduction_date,
          note: d.notes || null,
          sourceKind: "manual_deduction",
          sourceId: d.id,
          sourceLabel: `خصم HR (${d.deduction_type || "يدوي"})`,
          sourceTable: "employee_deductions",
        });
      }

      // From financial movements (debit only — owed by employee)
      for (const m of finMovesRes.data || []) {
        if (String(m.movement_type || "").toLowerCase() !== "debit") continue;
        const cat = categorizeMovement(m);
        const bucket = (cat as keyof typeof fin) in fin ? (cat as keyof typeof fin) : "uncategorized";
        // Cross-link to transaction if source_id matches
        const linkedTx = m.source_id ? txById.get(m.source_id) : null;
        const txRef = linkedTx?.transaction_number || m.source_reference || null;
        const srcLabel = linkedTx
          ? txTypeLabel(linkedTx)
          : m.source_type
          ? `حركة (${m.source_type})`
          : "حركة مالية";
        fin[bucket].push({
          id: `mov-${m.id}`,
          label: m.description || m.source_type || "حركة مالية",
          category: cat,
          amount: num(m.amount),
          date: m.movement_date,
          reference: txRef,
          note: m.notes || null,
          meta: { source_type: m.source_type, source_id: m.source_id, linked_tx: linkedTx?.id || null },
          sourceKind: linkedTx ? "transaction" : "financial_movement",
          sourceId: linkedTx?.id || m.id,
          sourceLabel: srcLabel,
          sourceTable: linkedTx ? "transactions" : "employee_financial_movements",
        });
      }

      // Loan installments
      for (const inst of installmentsDue) {
        fin.loan.push({
          id: `inst-${inst.id}`,
          label: `قسط قرض (${inst.month_number})`,
          category: "loan_installment",
          amount: num(inst.installment_amount),
          date: inst.due_date,
          note: `رصيد بعد القسط: ₪${num(inst.balance_after).toFixed(2)}`,
          sourceKind: "loan_installment",
          sourceId: inst.loan_id || inst.id,
          sourceLabel: `قسط رقم ${inst.month_number}`,
          sourceTable: "loan_installments",
          meta: { loan_id: inst.loan_id, installment_id: inst.id, due_date: inst.due_date },
        });
      }

      const sumItems = (arr: PreviewLineItem[]) => arr.reduce((s, x) => s + x.amount, 0);
      const finTotal =
        sumItems(fin.previous_balance) +
        sumItems(fin.advance) +
        sumItems(fin.loan) +
        sumItems(fin.meal) +
        sumItems(fin.transport) +
        sumItems(fin.violation) +
        sumItems(fin.store_purchase) +
        sumItems(fin.settlement) +
        sumItems(fin.uncategorized);

      const attendanceTotal = lateAmount + earlyLeaveAmount + absentAmount;
      const additionsTotal = overtimeAmount;
      const totalDeductions = attendanceTotal + finTotal;
      const netEstimated = baseSalary + additionsTotal - totalDeductions;

      const warnings: string[] = [];
      if (openDays.length > 0) {
        warnings.push(`المعاينة تقديرية: يوجد ${openDays.length} يوم/أيام حضور غير مغلقة في هذه الفترة.`);
      }
      if (fin.uncategorized.length > 0) {
        warnings.push(`يوجد ${fin.uncategorized.length} حركة مالية غير مصنفة تحتاج مراجعة قبل الترحيل.`);
      }
      if (baseSalary <= 0) {
        warnings.push("لم يتم تحديد راتب أساسي للموظف — الأرقام تعتمد على الأجر بالساعة فقط.");
      }

      return {
        period: { year, month, start, end },
        employee: {
          id: employee.id,
          full_name: employee.full_name,
          base_salary: baseSalary,
          hourly_rate: hourlyRate,
          work_hours_per_day: workHoursPerDay,
          base_month_days: baseMonthDays,
          overtime_multiplier: overtimeMultiplier,
        },
        attendance: {
          workingDays: days.length,
          presentDays,
          lateDays,
          absentDays,
          incompleteDays,
          totalLateMinutes: totalLateMin,
          totalEarlyLeaveMinutes: totalEarlyLeaveMin,
          totalOvertimeMinutes: totalOvertimeMin,
          openDays,
          lockedDays,
          hasOpenDays: openDays.length > 0,
        },
        additions: {
          overtimeAmount,
          items: additionItems,
          total: additionsTotal,
        },
        attendanceDeductions: {
          lateAmount,
          earlyLeaveAmount,
          absentAmount,
          items: attendanceItems,
          total: attendanceTotal,
        },
        financialDeductions: {
          previousBalance: fin.previous_balance,
          advances: fin.advance,
          loans: fin.loan,
          meals: fin.meal,
          transport: fin.transport,
          violations: fin.violation,
          storePurchases: fin.store_purchase,
          settlement: fin.settlement,
          uncategorized: fin.uncategorized,
          total: finTotal,
        },
        baseSalary,
        totalAdditions: additionsTotal,
        totalDeductions,
        netEstimated,
        isPreviewOnly: true,
        warnings,
      };
    },
  });
}
