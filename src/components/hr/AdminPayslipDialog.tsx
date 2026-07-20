import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, periodLabel, safeNum } from "@/lib/employeeFinancialDisplay";
import { tPayrollStatus } from "@/lib/hrLabels";

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
        fixedBreakdown: {
          annual: 0,
          admin: 0,
          food: transport + meal,
          family: spouse + children,
          others: custom + overtime + other,
          fixedDeduction: 0,
        },
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
        className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-background"
        dir="rtl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>قسيمة راتب {period}</DialogTitle>
        </DialogHeader>

        <div className="bg-background px-6 pt-6 pb-4 border-b border-border">
          {company?.logo_url ? (
            <div className="flex justify-center mb-3">
              <img src={company.logo_url} alt="" className="max-h-16 object-contain" />
            </div>
          ) : null}
          <div className="flex items-end justify-between gap-4">
            <div className="text-[11px] leading-tight text-muted-foreground">
              <div>رقم القسيمة</div>
              <div className="font-mono font-bold tabular-nums text-foreground">{view?.payslipNumber || "—"}</div>
              <div className="mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground border border-border">
                {view ? tPayrollStatus(view.status) : "—"}
              </div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Salary Slip · {period}</div>
              <div className="text-lg font-bold text-foreground truncate">قسيمة راتب — {employee?.full_name || ""}</div>
              <div className="mt-2 h-[2px] w-24 bg-[#0D1B2E] ms-auto rounded-full" />
            </div>
          </div>
        </div>

        {loading || !view ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل بيانات القسيمة...
          </div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 border border-border rounded-md overflow-hidden">
              <InfoCell label="الموظف" value={employee?.full_name || "—"} />
              <InfoCell label="الفرع" value={branchName || "—"} />
              <InfoCell label="الوظيفة" value={employee?.job_title || "—"} />
              <InfoCell label="تاريخ التعيين" value={employee?.start_date || "—"} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="أيام العمل" value={String(view.workingDays)} />
              <Stat label="ساعات العمل" value={view.workingHours.toFixed(2)} />
              <Stat label="ساعات الإضافي" value={view.overtimeHours.toFixed(2)} />
              <Stat label="إجازات (سنوية/مرضية)" value={`${view.annualLeave} / ${view.sickLeave}`} />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <SectionCard title="راتب الحضور">
                <RowLine label="محسوب من الساعات الفعلية" value={formatCurrency(view.attendanceSalary)} />
              </SectionCard>
              <SectionCard title="الراتب الثابت (مجموع العلاوات)">
                {view.fixedBreakdown.annual > 0 && <RowLine label="علاوة سنوية" value={formatCurrency(view.fixedBreakdown.annual)} />}
                {view.fixedBreakdown.food > 0 && <RowLine label="بدل أكل ومواصلات" value={formatCurrency(view.fixedBreakdown.food)} />}
                {view.fixedBreakdown.family > 0 && <RowLine label="علاوة زوجة وأبناء" value={formatCurrency(view.fixedBreakdown.family)} />}
                {view.fixedBreakdown.admin > 0 && <RowLine label="علاوة إدارية" value={formatCurrency(view.fixedBreakdown.admin)} />}
                {view.fixedBreakdown.others > 0 && <RowLine label="علاوات أخرى" value={formatCurrency(view.fixedBreakdown.others)} />}
                {view.fixedBreakdown.fixedDeduction > 0 && (
                  <RowLine label="خصم من الثابت" value={formatCurrency(view.fixedBreakdown.fixedDeduction)} negative />
                )}
                <div className="flex justify-between pt-2 mt-1 border-t border-border text-xs font-bold">
                  <span>إجمالي الراتب الثابت</span>
                  <span className="tabular-nums">{formatCurrency(view.baseSalary)}</span>
                </div>
              </SectionCard>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <SectionCard title="الاستحقاقات" tone="ok">
                {view.additions.length === 0
                  ? <p className="text-xs text-muted-foreground">لا استحقاقات إضافية</p>
                  : view.additions.map(r => <RowLine key={r.label} label={r.label} value={formatCurrency(r.amount)} />)}
                <div className="flex justify-between pt-2 mt-1 border-t border-border text-xs font-bold">
                  <span>إجمالي الإضافات</span>
                  <span className="tabular-nums text-emerald-700">{formatCurrency(view.totalAllowances)}</span>
                </div>
              </SectionCard>
              <SectionCard title="الخصومات" tone="bad">
                {view.deductions.length === 0
                  ? <p className="text-xs text-muted-foreground">لا خصومات</p>
                  : view.deductions.map(r => <RowLine key={r.label} label={r.label} value={formatCurrency(r.amount)} negative />)}
                <div className="flex justify-between pt-2 mt-1 border-t border-border text-xs font-bold">
                  <span>إجمالي الخصومات</span>
                  <span className="tabular-nums text-rose-700">{formatCurrency(view.totalDeductions)}</span>
                </div>
              </SectionCard>
            </div>

            <div className="flex items-center justify-between border-t-2 border-[#0D1B2E] bg-muted/40 rounded-md px-5 py-4">
              <span className="text-sm font-bold text-foreground">صافي الراتب</span>
              <span className="text-2xl font-extrabold tabular-nums text-[#0D1B2E]">{formatCurrency(view.netSalary)}</span>
            </div>

            {view.notes && (
              <p className="text-xs bg-muted/40 rounded-md p-2 whitespace-pre-wrap">{view.notes}</p>
            )}

            {view.source === "fallback" && (
              <p className="text-[11px] text-muted-foreground text-center">
                * لا يوجد سجل راتب معتمد لهذا الشهر — العرض محسوب من بيانات الحضور والبدلات الحالية.
              </p>
            )}
          </div>
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

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 border-l border-border last:border-l-0 bg-card">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold truncate">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md bg-card px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function SectionCard({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "ok" | "bad" }) {
  const barColor = tone === "ok" ? "bg-emerald-500" : tone === "bad" ? "bg-rose-500" : "bg-[#0D1B2E]";
  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <div className="flex items-stretch">
        <div className={`w-1 ${barColor}`} />
        <div className="flex-1 px-3 py-2">
          <div className="text-[11px] font-semibold text-[#0D1B2E] mb-2 border-b border-border pb-1">{title}</div>
          <div className="space-y-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function RowLine({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${negative ? "text-rose-700" : ""}`}>
        {negative ? "− " : ""}{value}
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
