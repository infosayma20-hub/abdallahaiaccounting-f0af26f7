import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Printer, Loader2, ChevronDown, Building2, Calendar, CalendarDays, Clock, BedDouble } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, periodLabel, safeNum } from "@/lib/employeeFinancialDisplay";
import { tPayrollStatus, payrollStatusTone } from "@/lib/hrLabels";

interface Props {
  open: boolean;
  onClose: () => void;
  employee: {
    id: string;
    full_name: string;
    department?: string | null;
    job_title?: string | null;
    id_number?: string | null;
    start_date?: string | null;
    branch_id?: string | null;
  } | null;
  month: number;
  year: number;
  userId?: string;
  company?: { name?: string | null; logo_url?: string | null; tax_number?: string | null } | null;
  fallback?: {
    basicSalary: number;
    totalEarnings: number;
    totalDeductions: number;
    netSalary: number;
    workDays: number;
    presentDays: number;
    annualLeaveDays: number;
    breakdown?: {
      transportation?: number;
      meal?: number;
      spouse?: number;
      children?: number;
      customAllowances?: number;
      overtimeAmount?: number;
      socialInsurance?: number;
      absenceDeduction?: number;
      advanceDeduction?: number;
      otherDeductions?: number;
    };
  } | null;
}

type Row = { label: string; amount: number };

export default function AdminPayslipDialog({
  open, onClose, employee, month, year, userId, company, fallback,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [payslip, setPayslip] = useState<any | null>(null);
  const [branchName, setBranchName] = useState<string>("");
  const [showFixedDetails, setShowFixedDetails] = useState(false);

  useEffect(() => {
    if (!open || !employee?.id || !userId) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      const [{ data: ps }, br] = await Promise.all([
        supabase
          .from("employee_payroll")
          .select("*")
          .eq("employee_id", employee.id)
          .eq("period_month", month)
          .eq("period_year", year)
          .maybeSingle(),
        employee.branch_id
          ? supabase.from("branches").select("name").eq("id", employee.branch_id).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      if (cancel) return;
      setPayslip(ps || null);
      setBranchName((br as any)?.data?.name || "");
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [open, employee?.id, employee?.branch_id, userId, month, year]);

  const view = useMemo(() => {
    if (payslip) {
      const additions: Row[] = [
        { label: "بدل دوام إضافي وإجازات", amount: safeNum(payslip.vacation_work_allowance) },
        { label: "مخالصة ومستحقات", amount: safeNum(payslip.settlement_amount) },
        { label: "راتب الشهر القادم (مقدّم)", amount: safeNum(payslip.next_month_salary_advance) },
      ].filter(r => r.amount > 0);

      const deductions: Row[] = [
        { label: "رصيد أول الشهر (سابق)", amount: safeNum(payslip.carry_over_balance) },
        { label: "رصيد افتتاحي", amount: safeNum(payslip.deduction_opening_balance) },
        { label: "قسط قرض", amount: safeNum(payslip.deduction_loan) },
        { label: "سلفة جديدة", amount: safeNum(payslip.deduction_new_advance) },
        { label: "سلفة نقدية", amount: safeNum(payslip.deduction_cash_advance) },
        { label: "مشتريات", amount: safeNum(payslip.deduction_purchases) },
        { label: "عجز صندوق", amount: safeNum(payslip.deduction_cash_shortage) },
        { label: "فائض", amount: safeNum(payslip.surplus_amount) },
        { label: "مخالفات", amount: safeNum(payslip.deduction_violations) },
        { label: "وجبات (مجموعة)", amount: safeNum(payslip.deduction_food_group) },
        { label: "وجبات (فردي)", amount: safeNum(payslip.deduction_food_individual) },
        { label: "مواصلات / توصيل", amount: safeNum(payslip.deduction_delivery) },
        { label: "خصومات أخرى", amount: safeNum(payslip.deduction_other) },
      ].filter(r => r.amount > 0);

      return {
        source: "db" as const,
        payslipNumber: payslip.payslip_number || "—",
        status: payslip.is_paid ? "paid" : (payslip.status || "pending"),
        attendanceSalary: safeNum(payslip.attendance_salary),
        baseSalary: safeNum(payslip.base_salary),
        totalAllowances: safeNum(payslip.total_allowances),
        totalDeductions: safeNum(payslip.total_deductions),
        netSalary: safeNum(payslip.net_salary),
        workingDays: safeNum(payslip.working_days),
        workingHours: safeNum(payslip.working_hours),
        overtimeHours: safeNum((payslip as any).overtime_hours_val),
        annualLeave: safeNum(payslip.annual_leave_days_taken),
        sickLeave: safeNum(payslip.sick_leave_days),
        fixedBreakdown: {
          annual: safeNum(payslip.annual_allowance),
          admin: safeNum(payslip.admin_allowance),
          food: safeNum(payslip.food_transport_net),
          family: safeNum(payslip.family_allowance),
          others: safeNum(payslip.other_allowances_val),
          fixedDeduction: safeNum(payslip.deduction_fixed_component),
        },
        additions,
        deductions,
        notes: payslip.notes as string | null,
      };
    }
    if (fallback) {
      const b = fallback.breakdown || {};
      const transport = safeNum(b.transportation);
      const meal = safeNum(b.meal);
      const spouse = safeNum(b.spouse);
      const children = safeNum(b.children);
      const custom = safeNum(b.customAllowances);
      const overtime = safeNum(b.overtimeAmount);
      const knownAllow = transport + meal + spouse + children + custom + overtime;
      const allow = Math.max(0, fallback.totalEarnings - fallback.basicSalary);
      const other = Math.max(0, allow - knownAllow);

      const additions: Row[] = [
        { label: "بدل مواصلات", amount: transport },
        { label: "بدل وجبات", amount: meal },
        { label: "علاوة زوجة", amount: spouse },
        { label: "علاوة أبناء", amount: children },
        { label: "علاوات مخصصة", amount: custom },
        { label: "أجر ساعات إضافية", amount: overtime },
      ].filter(r => r.amount > 0);

      const deductions: Row[] = [
        { label: "تأمين اجتماعي", amount: safeNum(b.socialInsurance) },
        { label: "خصم غياب", amount: safeNum(b.absenceDeduction) },
        { label: "سلف / خصومات مالية", amount: safeNum(b.advanceDeduction) },
        { label: "خصومات أخرى", amount: safeNum(b.otherDeductions) },
      ].filter(r => r.amount > 0);

      return {
        source: "fallback" as const,
        payslipNumber: "—",
        status: "pending",
        attendanceSalary: fallback.basicSalary,
        baseSalary: fallback.basicSalary,
        totalAllowances: allow,
        totalDeductions: fallback.totalDeductions,
        netSalary: fallback.netSalary,
        workingDays: fallback.workDays,
        workingHours: 0,
        overtimeHours: 0,
        annualLeave: fallback.annualLeaveDays,
        sickLeave: 0,
        fixedBreakdown: { annual: 0, admin: 0, food: 0, family: 0, others: 0, fixedDeduction: 0 },
        additions,
        deductions,
        notes: null as string | null,
      };
    }
    return null;
  }, [payslip, fallback]);

  const period = periodLabel(month, year);

  const handlePrint = () => {
    if (!view || !employee) return;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.open();
    w.document.write(buildPrintHtml({
      company: company || {},
      employeeName: employee.full_name,
      branchName,
      jobTitle: employee.job_title || "",
      startDate: employee.start_date || "",
      period,
      view,
    }));
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent
        className="max-w-md max-h-[92vh] overflow-y-auto p-0 gap-0 bg-background"
        dir="rtl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>قسيمة راتب {period}</DialogTitle>
        </DialogHeader>

        {/* 1. HEADER — Company brand + payslip number (same as employee view) */}
        <header className="bg-gradient-to-l from-primary to-primary/85 text-primary-foreground px-4 py-4">
          <div className="flex items-center gap-3">
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name || ""}
                className="h-11 w-11 rounded-lg object-contain bg-white/95 p-1"
              />
            ) : (
              <div className="h-11 w-11 rounded-lg bg-white/15 flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold truncate">{company?.name || "—"}</div>
              <div className="text-[11px] opacity-85">قسيمة راتب — {period}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
            <div>
              <div className="text-[10px] opacity-75">رقم القسيمة</div>
              <div className="text-xs font-bold tabular-nums tracking-wide">
                {view?.payslipNumber || "—"}
              </div>
            </div>
            {view && (
              <Badge
                variant="outline"
                className={`text-[10px] border-white/30 bg-white/10 ${payrollStatusTone(view.status)}`}
              >
                {tPayrollStatus(view.status)}
              </Badge>
            )}
          </div>
        </header>

        {loading || !view ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل بيانات القسيمة...
          </div>
        ) : (
          <>
            {/* 2. EMPLOYEE INFO — Name + Branch */}
            <section className="px-4 py-3 border-b border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">الموظف</div>
                  <div className="text-sm font-semibold truncate">{employee?.full_name || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">الفرع</div>
                  <div className="text-sm font-semibold truncate">{branchName || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">الوظيفة</div>
                  <div className="text-sm font-semibold truncate">{employee?.job_title || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">تاريخ التعيين</div>
                  <div className="text-sm font-semibold truncate">{employee?.start_date || "—"}</div>
                </div>
              </div>
            </section>

            {/* 3. PERIOD SUMMARY STRIP */}
            <section className="px-4 py-3 grid grid-cols-2 gap-2">
              <StatCard icon={Calendar} label="فترة الاستحقاق" value={period} />
              <StatCard icon={CalendarDays} label="أيام العمل" value={String(view.workingDays)} />
              <StatCard icon={Clock} label="ساعات العمل" value={view.workingHours.toFixed(2)} />
              <StatCard icon={Clock} label="ساعات العمل الإضافي" value={view.overtimeHours.toFixed(2)} />
              <StatCard icon={BedDouble} label="إجازات سنوية" value={String(view.annualLeave)} />
              <StatCard icon={BedDouble} label="إجازات مرضية" value={String(view.sickLeave)} />
            </section>

            {/* 4a. ATTENDANCE SALARY */}
            <section className="mx-4 mb-3 rounded-lg border border-border overflow-hidden">
              <div className="flex items-stretch border-r-2 border-r-emerald-500/70">
                <div className="flex-1 px-3 py-2 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">راتب الحضور</span>
                    <span className="text-sm font-bold tabular-nums">
                      {formatCurrency(view.attendanceSalary)}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    محسوب من ساعات الدوام الفعلية
                  </div>
                </div>
              </div>
            </section>

            {/* 4b. FIXED SALARY BREAKDOWN — Collapsible */}
            <section className="mx-4 mb-3 rounded-lg border border-border overflow-hidden">
              <Collapsible open={showFixedDetails} onOpenChange={setShowFixedDetails}>
                <div className="flex items-stretch border-r-2 border-r-primary/70">
                  <div className="flex-1 px-3 py-2 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">الراتب الثابت (مجموع العلاوات)</span>
                      <span className="text-sm font-bold tabular-nums">
                        {formatCurrency(view.baseSalary)}
                      </span>
                    </div>
                    <CollapsibleTrigger className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline focus:outline-none">
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${
                          showFixedDetails ? "rotate-180" : ""
                        }`}
                      />
                      {showFixedDetails ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="bg-primary/5 border-t border-border divide-y divide-border/60">
                    {view.fixedBreakdown.annual > 0 && (
                      <BreakdownRow label="علاوة سنوية" value={formatCurrency(view.fixedBreakdown.annual)} tone="ok" sign="+" />
                    )}
                    {view.fixedBreakdown.food > 0 && (
                      <BreakdownRow label="بدل أكل ومواصلات" value={formatCurrency(view.fixedBreakdown.food)} tone="ok" sign="+" />
                    )}
                    {view.fixedBreakdown.family > 0 && (
                      <BreakdownRow label="علاوة زوجة وأبناء" value={formatCurrency(view.fixedBreakdown.family)} tone="ok" sign="+" />
                    )}
                    {view.fixedBreakdown.admin > 0 && (
                      <BreakdownRow label="علاوة إدارية" value={formatCurrency(view.fixedBreakdown.admin)} tone="ok" sign="+" />
                    )}
                    {view.fixedBreakdown.others > 0 && (
                      <BreakdownRow label="علاوات أخرى" value={formatCurrency(view.fixedBreakdown.others)} tone="ok" sign="+" />
                    )}
                    {view.fixedBreakdown.fixedDeduction > 0 && (
                      <BreakdownRow label="خصم من الثابت" value={formatCurrency(view.fixedBreakdown.fixedDeduction)} tone="bad" sign="−" />
                    )}
                    <div className="px-3 py-2 bg-card flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        إجمالي الراتب الثابت
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {formatCurrency(view.baseSalary)}
                      </span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>

            {/* 5. EARNINGS & DEDUCTIONS */}
            <section className="px-4 pb-3 space-y-3">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-1.5 bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border-b border-border">
                  الاستحقاقات
                </div>
                <div className="divide-y divide-border/60 bg-card">
                  {view.additions.map((r) => (
                    <BreakdownRow key={r.label} label={r.label} value={formatCurrency(r.amount)} tone="ok" />
                  ))}
                  <BreakdownRow label="إجمالي الإضافات" value={formatCurrency(view.totalAllowances)} tone="ok" bold />
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-1.5 bg-rose-500/10 text-[11px] font-semibold text-rose-700 dark:text-rose-400 border-b border-border">
                  الخصومات
                </div>
                <div className="divide-y divide-border/60 bg-card">
                  {view.deductions.map((r) => (
                    <BreakdownRow key={r.label} label={r.label} value={formatCurrency(r.amount)} tone="bad" />
                  ))}
                  <BreakdownRow label="إجمالي الخصومات" value={formatCurrency(view.totalDeductions)} tone="bad" bold />
                </div>
              </div>

              {/* Net */}
              <div className="rounded-lg bg-primary/5 border border-primary/30 px-3 py-3 flex items-center justify-between">
                <span className="text-sm font-bold">صافي الراتب</span>
                <span className="text-lg font-extrabold text-primary tabular-nums">
                  {formatCurrency(view.netSalary)}
                </span>
              </div>

              {view.notes && (
                <p className="text-xs bg-muted/40 rounded-lg p-2 whitespace-pre-wrap">{view.notes}</p>
              )}

              {view.source === "fallback" && (
                <p className="text-[11px] text-muted-foreground text-center">
                  * لا يوجد سجل راتب معتمد لهذا الشهر — العرض محسوب من بيانات الحضور والبدلات الحالية.
                </p>
              )}
            </section>
          </>
        )}

        <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button onClick={handlePrint} disabled={!view} className="gap-2">
            <Printer className="h-4 w-4" /> طباعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  tone,
  bold,
  sign,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "muted";
  bold?: boolean;
  sign?: "+" | "−";
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
      <span className={tone === "muted" ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-bold" : "font-medium"} ${
          tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-foreground"
        }`}
      >
        {sign ? `${sign} ` : ""}
        {value}
      </span>
    </div>
  );
}

function buildPrintHtml(a: {
  company: { name?: string | null; logo_url?: string | null; tax_number?: string | null };
  employeeName: string;
  branchName: string;
  jobTitle: string;
  startDate: string;
  period: string;
  view: any;
}) {
  const { company, view } = a;
  const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(Number(n) || 0);
  const today = new Date().toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });

  const rowsAdd = view.additions.length
    ? view.additions.map((r: Row) => `<tr><td>${r.label}</td><td class="amt">${money(r.amount)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="muted">لا استحقاقات إضافية</td></tr>`;
  const rowsSub = view.deductions.length
    ? view.deductions.map((r: Row) => `<tr><td>${r.label}</td><td class="amt neg">− ${money(r.amount)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="muted">لا خصومات</td></tr>`;

  const fx = view.fixedBreakdown;
  const fixedRows = [
    fx.annual > 0 ? `<tr><td>علاوة سنوية</td><td class="amt">${money(fx.annual)}</td></tr>` : "",
    fx.food > 0 ? `<tr><td>بدل أكل ومواصلات</td><td class="amt">${money(fx.food)}</td></tr>` : "",
    fx.family > 0 ? `<tr><td>علاوة زوجة وأبناء</td><td class="amt">${money(fx.family)}</td></tr>` : "",
    fx.admin > 0 ? `<tr><td>علاوة إدارية</td><td class="amt">${money(fx.admin)}</td></tr>` : "",
    fx.others > 0 ? `<tr><td>علاوات أخرى</td><td class="amt">${money(fx.others)}</td></tr>` : "",
    fx.fixedDeduction > 0 ? `<tr><td>خصم من الثابت</td><td class="amt neg">− ${money(fx.fixedDeduction)}</td></tr>` : "",
  ].filter(Boolean).join("");

  return `<!doctype html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"/><title>قسيمة راتب — ${a.employeeName} ${a.period}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family:'Cairo', Arial, sans-serif; color:#0f172a; background:#fff; font-size:12.5px; }
  .page { max-width: 210mm; margin: 0 auto; padding: 6mm; }
  .logo { text-align:center; margin: 0 0 10px; }
  .logo img { max-height: 90px; max-width: 220px; object-fit: contain; }
  .band { padding:8px 0 14px; display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #0D1B2E; }
  .band .en { font-size:10.5px; letter-spacing:2px; color:#64748b; text-transform:uppercase; }
  .band .ar { font-size:18px; font-weight:800; color:#0f172a; }
  .band .ref { font-family:'Courier New', monospace; font-weight:700; color:#0f172a; }
  .meta { display:grid; grid-template-columns:repeat(4, 1fr); border:1px solid #e2e8f0; border-radius:6px; margin:12px 0; overflow:hidden; }
  .meta > div { padding:8px 12px; border-left:1px solid #e2e8f0; background:#fff; }
  .meta > div:last-child { border-left:none; }
  .meta .k { color:#64748b; font-size:10.5px; }
  .meta .v { font-size:12.5px; font-weight:700; }
  .stats { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:12px; }
  .stat { border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; background:#f8fafc; }
  .stat .k { color:#64748b; font-size:10.5px; }
  .stat .v { font-size:14px; font-weight:800; }
  .cards { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
  .card { border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
  .card .h { background:#f1f5f9; color:#0D1B2E; font-weight:700; font-size:12px; padding:8px 12px; border-bottom:1px solid #e2e8f0; }
  table { width:100%; border-collapse:collapse; }
  td { padding:7px 12px; font-size:12px; border-top:1px solid #f1f5f9; }
  td.amt { text-align:center; font-family:'Courier New', monospace; font-weight:700; width:38%; }
  td.neg, .neg { color:#b91c1c; }
  .muted { color:#64748b; text-align:center; font-size:11px; }
  .total { background:#f8fafc; font-weight:800; }
  .net { margin-top:12px; background:#f8fafc; color:#0f172a; padding:14px 18px; border-radius:6px; border-top:3px solid #0D1B2E; display:flex; justify-content:space-between; align-items:center; }
  .net .lbl { font-size:14px; font-weight:800; }
  .net .v { font-size:22px; font-weight:800; font-family:'Courier New', monospace; color:#0D1B2E; }
  .sig { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:26px; }
  .sig .line { border-top:1px solid #0f172a; padding-top:6px; text-align:center; font-size:12px; }
  .footer { margin-top:18px; text-align:center; font-size:10.5px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:8px; }
  .bar { position: fixed; top:10px; left:10px; z-index:9999; }
  .btn { background:#0D1B2E; color:#fff; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-family:inherit; }
  @media print { .noprint { display:none !important; } }
</style></head><body>
<div class="bar noprint"><button class="btn" onclick="window.print()">طباعة / حفظ PDF</button></div>
<div class="page">
  ${company.logo_url ? `<div class="logo"><img src="${company.logo_url}" alt=""/></div>` : ""}
  <div class="band">
    <div>
      <div class="en">Salary Slip · ${a.period}</div>
      <div class="ar">قسيمة راتب — ${company.name || ""}</div>
    </div>
    <div style="text-align:left">
      <div class="en">Ref / Date</div>
      <div class="ref">${view.payslipNumber} · ${today}</div>
    </div>
  </div>
  <div class="meta">
    <div><div class="k">الموظف</div><div class="v">${a.employeeName}</div></div>
    <div><div class="k">الفرع</div><div class="v">${a.branchName || "—"}</div></div>
    <div><div class="k">الوظيفة</div><div class="v">${a.jobTitle || "—"}</div></div>
    <div><div class="k">تاريخ التعيين</div><div class="v">${a.startDate || "—"}</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">أيام العمل</div><div class="v">${view.workingDays}</div></div>
    <div class="stat"><div class="k">ساعات العمل</div><div class="v">${view.workingHours.toFixed(2)}</div></div>
    <div class="stat"><div class="k">ساعات الإضافي</div><div class="v">${view.overtimeHours.toFixed(2)}</div></div>
    <div class="stat"><div class="k">إجازات سنوية/مرضية</div><div class="v">${view.annualLeave} / ${view.sickLeave}</div></div>
  </div>
  <div class="cards">
    <div class="card">
      <div class="h">راتب الحضور</div>
      <table><tr><td>محسوب من الساعات الفعلية</td><td class="amt">${money(view.attendanceSalary)}</td></tr></table>
    </div>
    <div class="card">
      <div class="h">الراتب الثابت (مجموع العلاوات)</div>
      <table>
        ${fixedRows || `<tr><td colspan="2" class="muted">—</td></tr>`}
        <tr class="total"><td>إجمالي الراتب الثابت</td><td class="amt">${money(view.baseSalary)}</td></tr>
      </table>
    </div>
  </div>
  <div class="cards">
    <div class="card">
      <div class="h">الاستحقاقات</div>
      <table>${rowsAdd}<tr class="total"><td>إجمالي الإضافات</td><td class="amt">${money(view.totalAllowances)}</td></tr></table>
    </div>
    <div class="card">
      <div class="h">الخصومات</div>
      <table>${rowsSub}<tr class="total"><td>إجمالي الخصومات</td><td class="amt neg">− ${money(view.totalDeductions)}</td></tr></table>
    </div>
  </div>
  <div class="net"><div class="lbl">صافي الراتب</div><div class="v">${money(view.netSalary)}</div></div>
  <div class="sig">
    <div class="line">توقيع الموظف<br/><span class="muted">${a.employeeName}</span></div>
    <div class="line">توقيع الموارد البشرية<br/><span class="muted">${company.name || ""}</span></div>
  </div>
  <div class="footer">هذه الوثيقة صادرة إلكترونياً من نظام أموالي المحاسبي</div>
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));</script>
</body></html>`;
}
