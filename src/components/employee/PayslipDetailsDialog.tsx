import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Building2, Calendar, CalendarDays, Clock, BedDouble } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, periodLabel, safeNum } from "@/lib/employeeFinancialDisplay";
import { tPayrollStatus, payrollStatusTone } from "@/lib/hrLabels";

interface Props {
  payslip: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Row = ({
  label,
  value,
  tone,
  bold,
  indent,
  sign,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "muted";
  bold?: boolean;
  indent?: boolean;
  sign?: "+" | "−";
}) => (
  <div
    className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${
      indent ? "pr-6" : ""
    }`}
  >
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

const Stat = ({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-border bg-card/60 p-2.5">
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </div>
    <div className="text-sm font-bold tabular-nums">{value}</div>
  </div>
);

export default function PayslipDetailsDialog({ payslip, open, onOpenChange }: Props) {
  const [employee, setEmployee] = useState<any>(null);
  const [branchName, setBranchName] = useState<string>("");
  const [company, setCompany] = useState<any>(null);
  const [showFixedDetails, setShowFixedDetails] = useState(false);

  useEffect(() => {
    if (!open || !payslip?.employee_id) return;
    let cancel = false;
    (async () => {
      const { data: emp } = await supabase
        .from("employees")
        .select("full_name, branch_id, company_id")
        .eq("id", payslip.employee_id)
        .maybeSingle();
      if (cancel || !emp) return;
      setEmployee(emp);

      const branchId = payslip.branch_id || emp.branch_id;
      const [branchRes, companyRes] = await Promise.all([
        branchId
          ? supabase.from("branches").select("name").eq("id", branchId).maybeSingle()
          : Promise.resolve({ data: null }),
        emp.company_id
          ? supabase
              .from("companies")
              .select("name, logo_url")
              .eq("id", emp.company_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancel) return;
      setBranchName(branchRes.data?.name || "");
      setCompany(companyRes.data || null);
    })();
    return () => {
      cancel = true;
    };
  }, [open, payslip?.employee_id, payslip?.branch_id]);

  if (!payslip) return null;

  const vacationWork = safeNum(payslip.vacation_work_allowance);
  const settlement = safeNum(payslip.settlement_amount);
  const nextMonthAdv = safeNum(payslip.next_month_salary_advance);
  const additions = safeNum(payslip.total_allowances) + safeNum(payslip.total_overtime);
  const deductions = safeNum(payslip.total_deductions);
  const carryOver = safeNum(payslip.carry_over_balance);
  const surplus = safeNum(payslip.surplus_amount);
  const status = payslip.is_paid ? "paid" : payslip.status || "pending";

  // Fixed salary breakdown components
  const annual = safeNum(payslip.annual_allowance);
  const admin = safeNum(payslip.admin_allowance);
  const food = safeNum(payslip.food_transport_net);
  const family = safeNum(payslip.family_allowance);
  const others = safeNum(payslip.other_allowances_val);
  const fixedDeduction = safeNum(payslip.deduction_fixed_component);
  const baseSalary = safeNum(payslip.base_salary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[92vh] overflow-y-auto p-0 gap-0 bg-background"
        dir="rtl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>قسيمة راتب</DialogTitle>
        </DialogHeader>

        {/* 1. HEADER — Company brand + payslip number */}
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
              <div className="text-[11px] opacity-85">قسيمة راتب رسمية</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
            <div>
              <div className="text-[10px] opacity-75">رقم القسيمة</div>
              <div className="text-xs font-bold tabular-nums tracking-wide">
                {payslip.payslip_number || "—"}
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] border-white/30 bg-white/10 ${payrollStatusTone(status)}`}
            >
              {tPayrollStatus(status)}
            </Badge>
          </div>
        </header>

        {/* 2. EMPLOYEE INFO — Name + Branch only */}
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
          </div>
        </section>

        {/* 3. PERIOD SUMMARY STRIP */}
        <section className="px-4 py-3 grid grid-cols-2 gap-2">
          <Stat
            icon={Calendar}
            label="فترة الاستحقاق"
            value={periodLabel(payslip.period_month, payslip.period_year)}
          />
          <Stat
            icon={CalendarDays}
            label="أيام العمل"
            value={String(safeNum(payslip.working_days))}
          />
          <Stat
            icon={Clock}
            label="ساعات العمل"
            value={String(safeNum(payslip.working_hours))}
          />
          <Stat
            icon={BedDouble}
            label="إجازات سنوية"
            value={String(safeNum(payslip.annual_leave_days_taken))}
          />
          <Stat
            icon={BedDouble}
            label="إجازات مرضية"
            value={String(safeNum(payslip.sick_leave_days))}
          />
        </section>

        {/* 4a. ATTENDANCE SALARY — from working hours */}
        <section className="mx-4 mb-3 rounded-lg border border-border overflow-hidden">
          <div className="flex items-stretch border-r-2 border-r-emerald-500/70">
            <div className="flex-1 px-3 py-2 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">راتب الحضور</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatCurrency(payslip.attendance_salary)}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                محسوب من ساعات الدوام الفعلية
              </div>
            </div>
          </div>
        </section>

        {/* 4b. FIXED SALARY BREAKDOWN — Collapsible (sum of allowances) */}
        <section className="mx-4 mb-3 rounded-lg border border-border overflow-hidden">
          <Collapsible open={showFixedDetails} onOpenChange={setShowFixedDetails}>
            <div className="flex items-stretch border-r-2 border-r-primary/70">
              <div className="flex-1 px-3 py-2 bg-card">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">الراتب الثابت (مجموع العلاوات)</span>
                  <span className="text-sm font-bold tabular-nums">
                    {formatCurrency(baseSalary)}
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
                {annual > 0 && (
                  <Row label="علاوة سنوية" value={formatCurrency(annual)} tone="ok" sign="+" indent />
                )}
                {food > 0 && (
                  <Row label="بدل أكل ومواصلات" value={formatCurrency(food)} tone="ok" sign="+" indent />
                )}
                {family > 0 && (
                  <Row label="علاوة زوجة وأبناء" value={formatCurrency(family)} tone="ok" sign="+" indent />
                )}
                {admin > 0 && (
                  <Row label="علاوة إدارية" value={formatCurrency(admin)} tone="ok" sign="+" indent />
                )}
                {others > 0 && (
                  <Row label="علاوات أخرى" value={formatCurrency(others)} tone="ok" sign="+" indent />
                )}
                {fixedDeduction > 0 && (
                  <Row
                    label="خصم من الثابت"
                    value={formatCurrency(fixedDeduction)}
                    tone="bad"
                    sign="−"
                    indent
                  />
                )}
                <div className="px-3 py-2 bg-card flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    إجمالي الراتب الثابت
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {formatCurrency(baseSalary)}
                  </span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* Earnings & Deductions */}
        <section className="px-4 pb-3 space-y-3">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-1.5 bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border-b border-border">
              الاستحقاقات
            </div>
            <div className="divide-y divide-border/60 bg-card">
              {vacationWork > 0 && (
                <Row label="بدل دوام إضافي وإجازات" value={formatCurrency(vacationWork)} tone="ok" />
              )}
              {settlement > 0 && (
                <Row label="مخالصة ومستحقات" value={formatCurrency(settlement)} tone="ok" />
              )}
              {nextMonthAdv > 0 && (
                <Row label="راتب الشهر القادم (مقدّم)" value={formatCurrency(nextMonthAdv)} tone="ok" />
              )}
              {safeNum(payslip.total_overtime) > 0 && (
                <Row label="إجمالي الأوفرتايم" value={formatCurrency(payslip.total_overtime)} tone="ok" />
              )}
              <Row label="إجمالي الإضافات" value={formatCurrency(additions)} tone="ok" bold />
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-1.5 bg-rose-500/10 text-[11px] font-semibold text-rose-700 dark:text-rose-400 border-b border-border">
              الخصومات
            </div>
            <div className="divide-y divide-border/60 bg-card">
              {carryOver > 0 && <Row label="رصيد أول الشهر (سابق)" value={formatCurrency(carryOver)} tone="bad" />}
              {safeNum(payslip.deduction_loan) > 0 && <Row label="قسط قرض" value={formatCurrency(payslip.deduction_loan)} tone="bad" />}
              {safeNum(payslip.deduction_new_advance) > 0 && <Row label="سلفة جديدة" value={formatCurrency(payslip.deduction_new_advance)} tone="bad" />}
              {safeNum(payslip.deduction_cash_advance) > 0 && <Row label="سلفة نقدية" value={formatCurrency(payslip.deduction_cash_advance)} tone="bad" />}
              {safeNum(payslip.deduction_purchases) > 0 && <Row label="مشتريات" value={formatCurrency(payslip.deduction_purchases)} tone="bad" />}
              {safeNum(payslip.deduction_cash_shortage) > 0 && <Row label="عجز صندوق" value={formatCurrency(payslip.deduction_cash_shortage)} tone="bad" />}
              {surplus > 0 && <Row label="فائض" value={formatCurrency(surplus)} tone="bad" />}
              {safeNum(payslip.deduction_violations) > 0 && <Row label="مخالفات" value={formatCurrency(payslip.deduction_violations)} tone="bad" />}
              {safeNum(payslip.deduction_food_group) > 0 && <Row label="وجبات (مجموعة)" value={formatCurrency(payslip.deduction_food_group)} tone="bad" />}
              {safeNum(payslip.deduction_food_individual) > 0 && <Row label="وجبات (فردي)" value={formatCurrency(payslip.deduction_food_individual)} tone="bad" />}
              {safeNum(payslip.deduction_delivery) > 0 && <Row label="مواصلات / توصيل" value={formatCurrency(payslip.deduction_delivery)} tone="bad" />}
              {safeNum(payslip.deduction_other) > 0 && <Row label="خصومات أخرى" value={formatCurrency(payslip.deduction_other)} tone="bad" />}
              <Row label="إجمالي الخصومات" value={formatCurrency(deductions)} tone="bad" bold />
            </div>
          </div>

          {/* Net */}
          <div className="rounded-lg bg-primary/5 border border-primary/30 px-3 py-3 flex items-center justify-between">
            <span className="text-sm font-bold">صافي الراتب</span>
            <span className="text-lg font-extrabold text-primary tabular-nums">
              {formatCurrency(payslip.net_salary)}
            </span>
          </div>

          {payslip.notes && (
            <p className="text-xs bg-muted/40 rounded-lg p-2 whitespace-pre-wrap">{payslip.notes}</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
