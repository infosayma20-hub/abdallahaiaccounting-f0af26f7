import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useEmployee360
 * ---------------------------------------------------
 * Unified data layer for the Employee 360 view.
 * Aggregates: profile, attendance, payroll, leaves,
 * loans, deductions, allowances, forms, financial
 * movements, transactions and a unified timeline.
 *
 * Read-only — does NOT mutate or modify any existing
 * UI/page. Safe to call from any future component.
 */

export type Employee360Data = {
  employee: any | null;
  attendance: {
    days: any[];
    events: any[];
    stats: {
      totalDays: number;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      incompleteDays: number;
      totalOvertime: number;
      avgHours: number;
      attendanceRate: number; // 0..1
      lateRate: number;       // 0..1
    };
  };
  payroll: {
    runs: any[];           // employee_payroll
    inputs: any[];         // monthly_payroll_inputs
    settings: any | null;  // payroll_settings (company)
    allowances: any[];     // employee_allowances (active)
    last: any | null;
  };
  leaves: {
    requests: any[];       // ✅ employee_leaves (canonical) — kept name for UI back-compat
    history: any[];        // ✅ employee_leaves (canonical) — same source
    pendingCount: number;
    approvedCount: number;
  };
  loans: {
    list: any[];           // employee_loans
    installments: any[];   // loan_installments
    activeTotal: number;
    remainingTotal: number;
    monthlyInstallment: number;
  };
  deductions: {
    list: any[];           // employee_deductions
    monthTotal: number;
    last30DaysTotal: number;
  };
  forms: any[];            // employee_forms
  financialMovements: any[]; // employee_financial_movements
  transactions: any[];     // transactions linked to employee
  timeline: TimelineEvent[];
};

export type TimelineEvent = {
  id: string;
  type:
    | "attendance"
    | "payroll"
    | "leave"
    | "loan"
    | "deduction"
    | "form"
    | "transaction"
    | "activity";
  title: string;
  description?: string;
  amount?: number | null;
  date: string; // ISO
  status?: string;
  meta?: Record<string, any>;
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

export function useEmployee360(employeeId: string | undefined) {
  return useQuery<Employee360Data>({
    queryKey: ["employee-360", employeeId],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!employeeId) throw new Error("employeeId is required");

      const since30 = daysAgo(30);
      const sinceMonth = (() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split("T")[0];
      })();

      // ---- Employee base ----
      const { data: employee, error: empErr } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle();
      if (empErr) throw empErr;

      const companyId = employee?.company_id ?? null;
      const authUserId = employee?.auth_user_id ?? null;

      // ---- Parallel fetches: split into 3 batches to keep TS inference shallow ----
      const [
        attendanceDaysRes,
        attendanceEventsRes,
        payrollRunsRes,
        payrollInputsRes,
      ] = await Promise.all([
        supabase
          .from("attendance_days")
          .select("*")
          .eq("employee_id", employeeId)
          .gte("attendance_date", since30)
          .order("attendance_date", { ascending: false }),
        supabase
          .from("attendance_events")
          .select("event_type, event_time, status, branch_id, notes")
          .eq("employee_id", employeeId)
          .gte("event_time", `${since30}T00:00:00`)
          .order("event_time", { ascending: false })
          .limit(200),
        supabase
          .from("employee_payroll")
          .select("*")
          .eq("employee_id", employeeId)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(6),
        supabase
          .from("monthly_payroll_inputs")
          .select("*")
          .eq("employee_id", employeeId)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(6),
      ]);

      const [
        allowancesRes,
        leaveHistRes,
        loansRes,
      ] = await Promise.all([
        supabase
          .from("employee_allowances")
          .select("*")
          .eq("employee_id", employeeId)
          .eq("is_active", true),
        // ✅ Canonical source for leaves — see src/hooks/hr/hrCanonicalSources.ts
        supabase
          .from("employee_leaves")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("employee_loans")
          .select(
            "id, total_amount, monthly_installment, total_months, paid_months, remaining_amount, first_payment_date, last_payment_date, status, notes, created_at"
          )
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false }),
      ]);

      const [
        deductionsRes,
        formsRes,
        finMovesRes,
        transactionsRes,
      ] = await Promise.all([
        supabase
          .from("employee_deductions")
          .select("*")
          .eq("employee_id", employeeId)
          .gte("deduction_date", daysAgo(90))
          .order("deduction_date", { ascending: false }),
        supabase
          .from("employee_forms")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("employee_financial_movements")
          .select("*")
          .eq("employee_id", employeeId)
          .order("movement_date", { ascending: false })
          .limit(100),
        (supabase as any)
          .from("transactions")
          .select(
            "id, transaction_number, transaction_date, transaction_type, total_amount, currency, description, status, party_type, party_id"
          )
          .eq("party_type", "employee")
          .eq("party_id", employeeId)
          .order("transaction_date", { ascending: false })
          .limit(50),
      ]);

      // ---- Conditional fetches (kept out of Promise.all to preserve typing) ----
      const payrollSettingsRes = companyId
        ? await supabase
            .from("payroll_settings")
            .select("*")
            .eq("company_id", companyId)
            .maybeSingle()
        : { data: null as any, error: null };

      const activityRes = authUserId
        ? await supabase
            .from("activity_log")
            .select("*")
            .eq("entity_type", "employee")
            .eq("entity_id", employeeId)
            .order("created_at", { ascending: false })
            .limit(50)
        : { data: [] as any[], error: null };

      const attendanceDays = attendanceDaysRes.data || [];
      const attendanceEvents = attendanceEventsRes.data || [];
      const payrollRuns = payrollRunsRes.data || [];
      const payrollInputs = payrollInputsRes.data || [];
      const allowances = allowancesRes.data || [];
      // Single source of truth: employee_leaves
      const leaveRecords = leaveHistRes.data || [];
      const loans = loansRes.data || [];
      const deductions = deductionsRes.data || [];
      const forms = formsRes.data || [];
      const finMoves = finMovesRes.data || [];
      const transactions = transactionsRes.data || [];
      const activity = activityRes.data || [];

      // ---- Loan installments (only for active loans) ----
      const activeLoanIds = loans
        .filter((l: any) => l.status === "active" || l.status === "نشط")
        .map((l: any) => l.id);
      let installments: any[] = [];
      if (activeLoanIds.length > 0) {
        const { data: instData } = await supabase
          .from("loan_installments")
          .select("*")
          .in("loan_id", activeLoanIds)
          .order("due_date", { ascending: true });
        installments = instData || [];
      }

      // ---- Attendance stats (last 30 days window) ----
      const totalDays = attendanceDays.length;
      const presentDays = attendanceDays.filter((d: any) =>
        ["present", "حاضر", "complete", "مكتمل"].includes(d.status)
      ).length;
      const lateDays = attendanceDays.filter((d: any) =>
        ["late", "متأخر"].includes(d.status)
      ).length;
      const absentDays = attendanceDays.filter((d: any) =>
        ["absent", "غائب"].includes(d.status)
      ).length;
      const incompleteDays = attendanceDays.filter((d: any) =>
        ["incomplete", "ناقص"].includes(d.status)
      ).length;
      const totalOvertime = attendanceDays.reduce(
        (s: number, d: any) => s + Number(d.overtime_hours || 0),
        0
      );
      const totalHours = attendanceDays.reduce(
        (s: number, d: any) => s + Number(d.total_hours || 0),
        0
      );
      const avgHours = totalDays > 0 ? totalHours / totalDays : 0;
      const attendanceRate =
        totalDays > 0 ? (presentDays + lateDays) / totalDays : 1;
      const lateRate = totalDays > 0 ? lateDays / totalDays : 0;

      // ---- Loan aggregates ----
      const activeLoans = loans.filter(
        (l: any) => l.status === "active" || l.status === "نشط"
      );
      const activeTotal = activeLoans.reduce(
        (s: number, l: any) => s + Number(l.total_amount || 0),
        0
      );
      const remainingTotal = activeLoans.reduce(
        (s: number, l: any) => s + Number(l.remaining_amount || 0),
        0
      );
      const monthlyInstallment = activeLoans.reduce(
        (s: number, l: any) => s + Number(l.monthly_installment || 0),
        0
      );

      // ---- Deduction aggregates ----
      const monthTotal = deductions
        .filter((d: any) => d.deduction_date >= sinceMonth)
        .reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
      const last30DaysTotal = deductions
        .filter((d: any) => d.deduction_date >= since30)
        .reduce((s: number, d: any) => s + Number(d.amount || 0), 0);

      // ---- Leave aggregates (employee_leaves uses Arabic statuses) ----
      const pendingCount = leaveRecords.filter(
        (r: any) =>
          r.status === "pending" ||
          r.status === "قيد المراجعة" ||
          r.status === "معلقة",
      ).length;
      const approvedCount = leaveRecords.filter(
        (r: any) =>
          r.status === "approved" ||
          r.status === "معتمد" ||
          r.status === "موافقة" ||
          r.status === "معتمدة",
      ).length;

      // ---- Build unified timeline ----
      const timeline: TimelineEvent[] = [];

      payrollRuns.forEach((p: any) => {
        timeline.push({
          id: `payroll-${p.id}`,
          type: "payroll",
          title: `قسيمة راتب ${p.period_month}/${p.period_year}`,
          description: p.is_paid ? "تم الصرف" : "غير مصروفة",
          amount: Number(p.net_salary || 0),
          date: p.paid_date || p.created_at,
          status: p.is_paid ? "paid" : "pending",
        });
      });

      leaveRecords.forEach((l: any) => {
        timeline.push({
          id: `leave-${l.id}`,
          type: "leave",
          title: `طلب إجازة (${l.leave_type})`,
          description: `${l.start_date} → ${l.end_date} (${l.days_count} يوم)`,
          date: l.created_at,
          status: l.status,
        });
      });

      loans.forEach((l: any) => {
        timeline.push({
          id: `loan-${l.id}`,
          type: "loan",
          title: "قرض حسن",
          description: `${l.paid_months}/${l.total_months} قسط`,
          amount: Number(l.total_amount || 0),
          date: l.created_at,
          status: l.status,
        });
      });

      deductions.forEach((d: any) => {
        timeline.push({
          id: `deduction-${d.id}`,
          type: "deduction",
          title: `خصم: ${d.deduction_type || "متفرقات"}`,
          description: d.description || d.notes || undefined,
          amount: -Number(d.amount || 0),
          date: d.deduction_date,
          status: d.status,
        });
      });

      forms.forEach((f: any) => {
        timeline.push({
          id: `form-${f.id}`,
          type: "form",
          title: `نموذج: ${f.form_type}`,
          description: f.review_notes || undefined,
          date: f.created_at,
          status: f.status,
        });
      });

      transactions.forEach((t: any) => {
        timeline.push({
          id: `tx-${t.id}`,
          type: "transaction",
          title: `${t.transaction_type === "payment" ? "سند صرف" : "سند قبض"} ${t.transaction_number || ""}`.trim(),
          description: t.description || undefined,
          amount: Number(t.total_amount || 0),
          date: t.transaction_date,
          status: t.status,
        });
      });

      // Recent attendance anomalies only (late / absent / incomplete)
      attendanceDays
        .filter((d: any) =>
          ["late", "absent", "incomplete", "متأخر", "غائب", "ناقص"].includes(
            d.status
          )
        )
        .slice(0, 20)
        .forEach((d: any) => {
          timeline.push({
            id: `att-${d.id}`,
            type: "attendance",
            title: `حضور: ${d.status}`,
            description: `${Number(d.total_hours || 0).toFixed(1)} ساعة`,
            date: d.attendance_date,
            status: d.status,
          });
        });

      activity.forEach((a: any) => {
        timeline.push({
          id: `act-${a.id}`,
          type: "activity",
          title: a.action,
          description: a.entity_label || undefined,
          date: a.created_at,
          meta: a.details || undefined,
        });
      });

      // Sort newest first
      timeline.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      return {
        employee,
        attendance: {
          days: attendanceDays,
          events: attendanceEvents,
          stats: {
            totalDays,
            presentDays,
            lateDays,
            absentDays,
            incompleteDays,
            totalOvertime,
            avgHours,
            attendanceRate,
            lateRate,
          },
        },
        payroll: {
          runs: payrollRuns,
          inputs: payrollInputs,
          settings: payrollSettingsRes.data ?? null,
          allowances,
          last: payrollRuns[0] ?? null,
        },
        leaves: {
          requests: leaveRecords,
          history: leaveRecords,
          pendingCount,
          approvedCount,
        },
        loans: {
          list: loans,
          installments,
          activeTotal,
          remainingTotal,
          monthlyInstallment,
        },
        deductions: {
          list: deductions,
          monthTotal,
          last30DaysTotal,
        },
        forms,
        financialMovements: finMoves,
        transactions,
        timeline,
      };
    },
  });
}
