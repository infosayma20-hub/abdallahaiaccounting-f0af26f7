import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, CheckCircle2, AlertTriangle, FileText, Search } from "lucide-react";
import { calculateLeaveBalance } from "@/lib/hr-utils";

// ────────────── Types ──────────────
type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  branch_id: string | null;
  start_date: string | null;
  end_date: string | null;
  base_salary: number | null;
  is_active: boolean;
  is_terminated: boolean | null;
  annual_leave_balance: number | null;
  annual_leave_days: number | null;
  previous_year_balance: number | null;
};

type TerminationRow = {
  id: string;
  employee_id: string;
  termination_date: string;
  termination_reason: string;
  years_worked: number;
  severance_pay: number;
  unused_leave_pay: number;
  current_month_salary: number;
  advance_balance: number;
  other_deductions: number;
  total_dues: number;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
};

const REASONS: { value: string; label: string }[] = [
  { value: "resignation", label: "استقالة" },
  { value: "termination", label: "فصل" },
  { value: "end_of_contract", label: "نهاية عقد" },
  { value: "probation_end", label: "نهاية فترة تجربة" },
  { value: "retirement", label: "تقاعد" },
  { value: "death", label: "وفاة" },
  { value: "mutual", label: "اتفاق طرفين" },
];

const fmtILS = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

// ────────────── Palestinian labor-law helpers ──────────────
function computeServiceYears(hireIso: string, endIso: string): { years: number; months: number; totalDays: number } {
  const totalDays = Math.max(0, differenceInCalendarDays(parseISO(endIso), parseISO(hireIso)));
  const years = totalDays / 365.25;
  const months = totalDays / 30.4375;
  return { years: +years.toFixed(4), months: +months.toFixed(2), totalDays };
}

/** End-of-service gratuity per Palestinian labor law (approximation). */
function computeSeverance(opts: {
  reason: string;
  years: number;
  monthlySalary: number;
  totalDays: number;
}): { amount: number; note: string } {
  const { reason, years, monthlySalary, totalDays } = opts;
  if (totalDays < 90) return { amount: 0, note: "أقل من 3 شهور — لا مكافأة نهاية خدمة (فترة تجربة)" };
  const full = monthlySalary * years; // شهر عن كل سنة، متناسب للكسور
  if (reason === "resignation") {
    if (years < 1) return { amount: 0, note: "استقالة قبل إتمام سنة — لا مكافأة" };
    if (years < 5) return { amount: full / 3, note: "استقالة (1–5 سنوات): ⅓ المكافأة" };
    if (years < 10) return { amount: (full * 2) / 3, note: "استقالة (5–10 سنوات): ⅔ المكافأة" };
    return { amount: full, note: "استقالة (+10 سنوات): مكافأة كاملة" };
  }
  return { amount: full, note: "مكافأة كاملة (فصل / نهاية عقد / تقاعد / اتفاق)" };
}

// ────────────── List Page ──────────────
export default function SettlementsPage() {
  const dataOwnerId = useDataOwnerId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["termination-records", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("termination_records")
        .select("*")
        .eq("user_id", dataOwnerId!)
        .order("termination_date", { ascending: false });
      if (error) throw error;
      return (data || []) as TerminationRow[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-settlement-employees", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id,full_name,department,branch_id,start_date,end_date,base_salary,is_active,is_terminated,annual_leave_balance,annual_leave_days,previous_year_balance",
        )
        .eq("user_id", dataOwnerId!);
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const emp = empById.get(r.employee_id);
      return (
        (emp?.full_name || "").toLowerCase().includes(q) ||
        (r.termination_reason || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, empById]);

  const totals = useMemo(
    () => ({
      count: rows.length,
      paid: rows.filter((r) => r.is_paid).length,
      pending: rows.filter((r) => !r.is_paid).length,
      sumNet: rows.reduce((s, r) => s + Number(r.total_dues || 0), 0),
      sumPending: rows.filter((r) => !r.is_paid).reduce((s, r) => s + Number(r.total_dues || 0), 0),
    }),
    [rows],
  );

  return (
    <div dir="rtl" className="p-3 md:p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg md:text-xl font-bold">المخالصات ونهاية الخدمة</h1>
          <p className="text-xs text-muted-foreground">حساب المستحقات القانونية للموظفين المنتهية خدماتهم وفق قانون العمل الفلسطيني.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 ml-1" /> تحديث</Button>
          <Button size="sm" onClick={() => { setEditId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 ml-1" /> مخالصة جديدة
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">إجمالي المخالصات</div><div className="text-lg font-bold mt-1">{totals.count}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">مدفوعة</div><div className="text-lg font-bold mt-1 text-emerald-600">{totals.paid}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">قيد الدفع</div><div className="text-lg font-bold mt-1 text-amber-600">{totals.pending}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">صافي المستحقات المعلّقة</div><div className="text-sm font-bold mt-1 text-primary">{fmtILS(totals.sumPending)}</div></Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input dir="rtl" className="pr-8 h-9" placeholder="بحث بالاسم أو السبب…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-auto rounded-md border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right px-3 py-2 font-medium">الموظف</th>
                <th className="text-right px-3 py-2 font-medium">تاريخ الترك</th>
                <th className="text-right px-3 py-2 font-medium">السبب</th>
                <th className="text-right px-3 py-2 font-medium">مدة الخدمة</th>
                <th className="text-right px-3 py-2 font-medium">مكافأة</th>
                <th className="text-right px-3 py-2 font-medium">إجازات</th>
                <th className="text-right px-3 py-2 font-medium">شهر أخير</th>
                <th className="text-right px-3 py-2 font-medium">خصومات</th>
                <th className="text-right px-3 py-2 font-medium">الصافي</th>
                <th className="text-right px-3 py-2 font-medium">الحالة</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">جاري التحميل…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">لا توجد مخالصات مسجلة</td></tr>
              ) : filtered.map((r) => {
                const emp = empById.get(r.employee_id);
                const reasonLabel = REASONS.find((x) => x.value === r.termination_reason)?.label || r.termination_reason;
                const deductions = Number(r.advance_balance || 0) + Number(r.other_deductions || 0);
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{emp?.full_name || "—"}</td>
                    <td className="px-3 py-2">{format(parseISO(r.termination_date), "yyyy-MM-dd")}</td>
                    <td className="px-3 py-2">{reasonLabel}</td>
                    <td className="px-3 py-2">{Number(r.years_worked).toFixed(2)} سنة</td>
                    <td className="px-3 py-2">{fmtILS(Number(r.severance_pay))}</td>
                    <td className="px-3 py-2">{fmtILS(Number(r.unused_leave_pay))}</td>
                    <td className="px-3 py-2">{fmtILS(Number(r.current_month_salary))}</td>
                    <td className="px-3 py-2 text-rose-600">− {fmtILS(deductions)}</td>
                    <td className="px-3 py-2 font-bold text-primary">{fmtILS(Number(r.total_dues))}</td>
                    <td className="px-3 py-2">
                      {r.is_paid ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 ml-1" /> مدفوعة</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">قيد الدفع</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditId(r.id); setDialogOpen(true); }}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {dialogOpen && (
        <SettlementDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          employees={employees.filter((e) => e.is_active || !!e.end_date)}
          existingId={editId}
          existingRow={editId ? rows.find((r) => r.id === editId) || null : null}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["termination-records"] });
            setDialogOpen(false);
          }}
          dataOwnerId={dataOwnerId!}
        />
      )}
    </div>
  );
}

// ────────────── Dialog ──────────────
function SettlementDialog(props: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  existingId: string | null;
  existingRow: TerminationRow | null;
  onSaved: () => void;
  dataOwnerId: string;
}) {
  const { open, onClose, employees, existingRow, onSaved, dataOwnerId } = props;

  const [employeeId, setEmployeeId] = useState<string>(existingRow?.employee_id || "");
  const [terminationDate, setTerminationDate] = useState<string>(existingRow?.termination_date || format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState<string>(existingRow?.termination_reason || "resignation");
  const [notes, setNotes] = useState<string>(existingRow?.notes || "");
  const [isPaid, setIsPaid] = useState<boolean>(existingRow?.is_paid || false);
  const [paidDate, setPaidDate] = useState<string>(existingRow?.paid_date || "");

  // Editable amounts (auto-computed but overridable)
  const [salary, setSalary] = useState<number>(0);
  const [severance, setSeverance] = useState<number>(existingRow?.severance_pay || 0);
  const [unusedLeavePay, setUnusedLeavePay] = useState<number>(existingRow?.unused_leave_pay || 0);
  const [currentMonthSalary, setCurrentMonthSalary] = useState<number>(existingRow?.current_month_salary || 0);
  const [noticePay, setNoticePay] = useState<number>(0);
  const [advanceBalance, setAdvanceBalance] = useState<number>(existingRow?.advance_balance || 0);
  const [otherDeductions, setOtherDeductions] = useState<number>(existingRow?.other_deductions || 0);
  const [severanceNote, setSeveranceNote] = useState<string>("");
  const [autoRecalc, setAutoRecalc] = useState<boolean>(!existingRow);
  const [saving, setSaving] = useState(false);

  const emp = useMemo(() => employees.find((e) => e.id === employeeId) || null, [employees, employeeId]);

  // Fetch outstanding balances (advances + remaining loan installments) when employee changes
  const { data: financials } = useQuery({
    queryKey: ["settlement-financials", employeeId, dataOwnerId],
    enabled: !!employeeId && !!dataOwnerId,
    queryFn: async () => {
      const [advQ, loanQ, empPolQ] = await Promise.all([
        supabase
          .from("employee_advances")
          .select("amount,status")
          .eq("user_id", dataOwnerId)
          .eq("employee_id", employeeId)
          .in("status", ["approved", "active", "pending"]),
        supabase
          .from("loan_installments")
          .select("installment_amount,status")
          .eq("user_id", dataOwnerId)
          .eq("employee_id", employeeId)
          .neq("status", "paid"),
        supabase
          .from("employee_leaves")
          .select("days_count,leave_type,status")
          .eq("user_id", dataOwnerId)
          .eq("employee_id", employeeId)
          .eq("status", "approved"),
      ]);
      const advances = (advQ.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const loans = (loanQ.data || []).reduce((s: number, r: any) => s + Number(r.installment_amount || 0), 0);
      const usedAnnual = (empPolQ.data || [])
        .filter((r: any) => r.leave_type === "annual")
        .reduce((s: number, r: any) => s + Number(r.days_count || 0), 0);
      return { advances, loans, usedAnnual };
    },
  });

  // Auto-recalculate whenever inputs change (only until user disables auto)
  useEffect(() => {
    if (!autoRecalc || !emp) return;
    const monthly = Number(emp.base_salary || 0);
    setSalary(monthly);
    const hire = emp.start_date;
    if (!hire) {
      setSeverance(0);
      setSeveranceNote("لا يوجد تاريخ تعيين — لا يمكن حساب المكافأة");
    } else {
      const svc = computeServiceYears(hire, terminationDate);
      const sev = computeSeverance({ reason, years: svc.years, monthlySalary: monthly, totalDays: svc.totalDays });
      setSeverance(+sev.amount.toFixed(2));
      setSeveranceNote(sev.note);
    }
    // Current-month salary = days worked this month / days in month × monthly
    const term = parseISO(terminationDate);
    const daysInMonth = new Date(term.getFullYear(), term.getMonth() + 1, 0).getDate();
    const daysWorked = term.getDate();
    setCurrentMonthSalary(+((monthly * daysWorked) / daysInMonth).toFixed(2));
    // Unused leave pay: balance × daily wage (26 working days convention)
    const carriedOver = Number(emp.previous_year_balance || 0);
    const annualEntitlement = Number(emp.annual_leave_days || 14);
    const used = Number(financials?.usedAnnual || 0);
    const bal = calculateLeaveBalance(emp.start_date || null, carriedOver, annualEntitlement, used, terminationDate);
    const dailyWage = monthly / 26;
    setUnusedLeavePay(+(Math.max(0, Number(bal.available || 0)) * dailyWage).toFixed(2));
    setAdvanceBalance(+Number(financials?.advances || 0).toFixed(2) + +Number(financials?.loans || 0).toFixed(2));
  }, [autoRecalc, emp, terminationDate, reason, financials]);

  const totalDues = useMemo(() => {
    const gross = severance + unusedLeavePay + currentMonthSalary + noticePay;
    const deductions = advanceBalance + otherDeductions;
    return +(gross - deductions).toFixed(2);
  }, [severance, unusedLeavePay, currentMonthSalary, noticePay, advanceBalance, otherDeductions]);

  const service = useMemo(() => {
    if (!emp?.start_date) return null;
    return computeServiceYears(emp.start_date, terminationDate);
  }, [emp, terminationDate]);

  const probationWarning = service && service.totalDays < 90;

  const save = async () => {
    if (!employeeId) { toast.error("يجب اختيار الموظف"); return; }
    if (!terminationDate) { toast.error("يجب تحديد تاريخ الترك"); return; }
    setSaving(true);
    try {
      const payload = {
        user_id: dataOwnerId,
        employee_id: employeeId,
        termination_date: terminationDate,
        termination_reason: reason,
        years_worked: Number(service?.years || 0),
        severance_pay: severance,
        unused_leave_pay: unusedLeavePay,
        current_month_salary: currentMonthSalary + noticePay, // include notice in the salary bucket
        advance_balance: advanceBalance,
        other_deductions: otherDeductions,
        total_dues: totalDues,
        is_paid: isPaid,
        paid_date: isPaid ? (paidDate || format(new Date(), "yyyy-MM-dd")) : null,
        notes: notes || null,
      };
      let error;
      if (props.existingId) {
        ({ error } = await supabase.from("termination_records").update(payload).eq("id", props.existingId));
      } else {
        ({ error } = await supabase.from("termination_records").insert(payload));
      }
      if (error) throw error;
      // When marked as paid, also flag the employee as terminated
      if (isPaid && emp) {
        await supabase
          .from("employees")
          .update({ is_terminated: true, is_active: false, end_date: terminationDate })
          .eq("id", emp.id)
          .eq("user_id", dataOwnerId);
      }
      toast.success(props.existingId ? "تم تحديث المخالصة" : "تم حفظ المخالصة");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{props.existingId ? "تعديل مخالصة" : "مخالصة جديدة"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1. Employee + reason */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">الموظف *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!props.existingId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر الموظف…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">تاريخ الترك *</Label>
              <Input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">سبب الترك</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Employee summary */}
          {emp && (
            <Card className="p-3 bg-muted/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">تاريخ التعيين:</span> <b>{emp.start_date || "—"}</b></div>
                <div><span className="text-muted-foreground">مدة الخدمة:</span> <b>{service ? `${service.years.toFixed(2)} سنة (${Math.floor(service.months)} شهر)` : "—"}</b></div>
                <div><span className="text-muted-foreground">الراتب الشهري:</span> <b>{fmtILS(Number(emp.base_salary || 0))}</b></div>
                <div><span className="text-muted-foreground">الفرع/القسم:</span> <b>{emp.department || "—"}</b></div>
              </div>
              {probationWarning && (
                <div className="mt-2 flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertTriangle className="h-4 w-4" />
                  الموظف في فترة التجربة (أقل من 3 شهور) — لا يستحق مكافأة نهاية خدمة.
                </div>
              )}
              {severanceNote && !probationWarning && (
                <div className="mt-2 text-xs text-muted-foreground">📋 {severanceNote}</div>
              )}
            </Card>
          )}

          {/* 2. Dues */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">المستحقات</h3>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={autoRecalc} onChange={(e) => setAutoRecalc(e.target.checked)} />
                إعادة حساب تلقائي
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <NumField label="راتب الشهر الأخير" value={currentMonthSalary} onChange={(v) => { setAutoRecalc(false); setCurrentMonthSalary(v); }} />
              <NumField label="مكافأة نهاية الخدمة" value={severance} onChange={(v) => { setAutoRecalc(false); setSeverance(v); }} />
              <NumField label="بدل الإجازات غير المستنفدة" value={unusedLeavePay} onChange={(v) => { setAutoRecalc(false); setUnusedLeavePay(v); }} />
              <NumField label="بدل إشعار (اختياري)" value={noticePay} onChange={setNoticePay} />
            </div>
          </div>

          {/* 3. Deductions */}
          <div>
            <h3 className="text-sm font-bold mb-2">الخصومات</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <NumField label="سلف وقروض قائمة" value={advanceBalance} onChange={(v) => { setAutoRecalc(false); setAdvanceBalance(v); }} />
              <NumField label="خصومات أخرى (عهد، تلفيات…)" value={otherDeductions} onChange={setOtherDeductions} />
            </div>
            {financials && (financials.advances > 0 || financials.loans > 0) && (
              <div className="mt-2 text-xs text-muted-foreground">
                💡 السلف القائمة: {fmtILS(financials.advances)} · أقساط قروض متبقية: {fmtILS(financials.loans)}
              </div>
            )}
          </div>

          {/* Summary */}
          <Card className="p-3 bg-primary/5 border-primary/30">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">إجمالي المستحقات</div>
                <div className="text-sm font-bold text-emerald-700">{fmtILS(severance + unusedLeavePay + currentMonthSalary + noticePay)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">إجمالي الخصومات</div>
                <div className="text-sm font-bold text-rose-700">− {fmtILS(advanceBalance + otherDeductions)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">صافي المخالصة</div>
                <div className="text-lg font-bold text-primary">{fmtILS(totalDues)}</div>
              </div>
            </div>
          </Card>

          {/* Notes + paid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
                تم الدفع
              </label>
              {isPaid && (
                <div>
                  <Label className="text-xs">تاريخ الدفع</Label>
                  <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="h-9" />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={save} disabled={saving || !employeeId}>{saving ? "جاري الحفظ…" : "حفظ المخالصة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={Number.isFinite(props.value) ? props.value : 0}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
        className="h-9 text-sm"
      />
    </div>
  );
}