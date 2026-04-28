import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ShieldAlert, Eye, EyeOff, Lock, Unlock, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePayrollPreview, type PreviewLineItem } from "@/hooks/hr/usePayrollPreview";
import { HRTable, HRTHead, HRTH, HRTR, HRTD, HRMoney } from "../HRTable";
import { PayrollApprovalBar } from "../PayrollApprovalBar";

interface Props {
  employeeId: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v || 0));

const arabicMonths = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function PayrollPreviewTab({ employeeId }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [showDetails, setShowDetails] = useState(false);
  const navigate = useNavigate();

  const openSource = (item: PreviewLineItem) => {
    if (!item.sourceKind) return;
    switch (item.sourceKind) {
      case "transaction":
        if (item.sourceId) navigate(`/transactions/${item.sourceId}`);
        break;
      case "loan_installment":
      case "loan":
        navigate(`/loans?employee=${employeeId}`);
        break;
      case "manual_deduction":
        navigate(`/hr-deductions?employee=${employeeId}`);
        break;
      case "attendance":
        navigate(`/hr-attendance?employee=${employeeId}`);
        break;
      case "previous_balance":
      case "financial_movement":
        navigate(`/employees/${employeeId}?tab=overview`);
        break;
      default:
        break;
    }
  };

  const { data: p, isLoading, isError, error } = usePayrollPreview(employeeId, year, month);

  const monthOptions = arabicMonths.map((name, i) => ({ value: i + 1, label: name }));
  const yearOptions = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  // Snapshot fed into the approval bar — null until preview is computed
  const previewSnapshot = p
    ? {
        base_salary: Number(p.baseSalary || 0),
        total_allowances: Number(p.totalAdditions || 0),
        total_deductions: Number(p.totalDeductions || 0),
        total_overtime: Number(p.totalAdditions || 0),
        net_salary: Number(p.netEstimated || 0),
        attendance_salary: Number(p.baseSalary || 0),
        notes: null,
      }
    : null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header banner — non-binding */}
      <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription className="text-right text-sm font-medium">
          هذه معاينة تقديرية. لتحويلها إلى راتب رسمي اضغط <b>«تقديم للاعتماد»</b> ثم <b>«اعتماد»</b>.
          لا يتم إنشاء قيود محاسبية في هذه المرحلة.
        </AlertDescription>
      </Alert>

      {/* Approval workflow bar */}
      <PayrollApprovalBar
        employeeId={employeeId}
        year={year}
        month={month}
        previewSnapshot={previewSnapshot}
      />

      {/* Period selector */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">الفترة:</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-background border rounded-md px-3 py-1.5 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-background border rounded-md px-3 py-1.5 text-sm"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowDetails((s) => !s)}>
            {showDetails ? <EyeOff className="h-4 w-4 ml-1" /> : <Eye className="h-4 w-4 ml-1" />}
            {showDetails ? "إخفاء التفاصيل" : "عرض التفاصيل"}
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            تعذر تحميل المعاينة: {error instanceof Error ? error.message : "خطأ غير معروف"}
          </AlertDescription>
        </Alert>
      )}

      {p && (
        <>
          {/* Warnings */}
          {p.warnings.map((w, i) => (
            <Alert key={i} className="border-amber-500/40 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-right text-sm">{w}</AlertDescription>
            </Alert>
          ))}

          {/* Lock summary */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3 text-emerald-600" />
              مغلق: {p.attendance.lockedDays.length} يوم
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Unlock className="h-3 w-3 text-amber-600" />
              مفتوح: {p.attendance.openDays.length} يوم
            </Badge>
          </div>

          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="الراتب الأساسي" value={p.baseSalary} tone="primary" />
            <KPI label="إضافات (أوفر تايم)" value={p.totalAdditions} tone="positive" />
            <KPI label="إجمالي الخصومات" value={p.totalDeductions} tone="danger" />
            <KPI label="الصافي التقديري" value={p.netEstimated} tone={p.netEstimated < 0 ? "danger" : "primary"} bold />
          </div>

          {/* Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-right">تفصيل الحساب التقديري</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <Row label="الراتب الأساسي" value={p.baseSalary} />

              <SectionHeader label="إضافات" tone="positive" />
              {p.additions.items.length === 0 ? (
                <Empty msg="لا يوجد ساعات إضافية." />
              ) : (
                p.additions.items.map((it) => <LineRow key={it.id} item={it} positive />)
              )}

              <SectionHeader label="خصومات الحضور" tone="danger" />
              <div className="text-xs text-muted-foreground">
                تأخير: {p.attendance.totalLateMinutes} د | انصراف مبكر: {p.attendance.totalEarlyLeaveMinutes} د | غياب: {p.attendance.absentDays} يوم
              </div>
              {p.attendanceDeductions.items.length === 0 ? (
                <Empty msg="لا توجد خصومات حضور." />
              ) : (
                p.attendanceDeductions.items.map((it) => <LineRow key={it.id} item={it} />)
              )}

              <SectionHeader label="الخصومات المالية" tone="danger" />
              <FinSubsection title="رصيد سابق مستحق" items={p.financialDeductions.previousBalance} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="السلف" items={p.financialDeductions.advances} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="القروض" items={p.financialDeductions.loans} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="وجبات / أكل" items={p.financialDeductions.meals} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="مواصلات" items={p.financialDeductions.transport} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="مخالفات" items={p.financialDeductions.violations} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="مشتريات على حساب الموظف" items={p.financialDeductions.storePurchases} showDetails={showDetails} onOpen={openSource} />
              <FinSubsection title="عجز / فائض تسوية" items={p.financialDeductions.settlement} showDetails={showDetails} onOpen={openSource} />
              {p.financialDeductions.uncategorized.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    حركات غير مصنفة (تحتاج مراجعة)
                  </div>
                  <FinSubsection title="" items={p.financialDeductions.uncategorized} showDetails={showDetails} warn onOpen={openSource} />
                </div>
              )}

              <div className="border-t pt-3 mt-3 space-y-1">
                <Row label="إجمالي الإضافات" value={p.totalAdditions} tone="positive" />
                <Row label="إجمالي الخصومات" value={p.totalDeductions} tone="danger" />
                <Row label="الصافي التقديري" value={p.netEstimated} tone="primary" bold />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, tone, bold }: { label: string; value: number; tone: "primary" | "positive" | "danger"; bold?: boolean }) {
  const cls =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "danger"
      ? "text-rose-700 dark:text-rose-400"
      : "text-primary";
  return (
    <Card className="p-3 text-right">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`tabular-nums ${bold ? "text-2xl font-extrabold" : "text-xl font-bold"} ${cls}`}>₪{fmt(value)}</p>
    </Card>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: number; tone?: "positive" | "danger" | "primary"; bold?: boolean }) {
  const cls = tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : tone === "danger" ? "text-rose-700 dark:text-rose-400" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className={`text-sm ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold text-base" : "font-medium"} ${cls}`}>₪{fmt(value)}</span>
    </div>
  );
}

function SectionHeader({ label, tone }: { label: string; tone: "positive" | "danger" }) {
  const cls = tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400";
  return <div className={`mt-2 text-xs font-bold ${cls}`}>{label}</div>;
}

function LineRow({ item, positive }: { item: PreviewLineItem; positive?: boolean }) {
  const cls = positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400";
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <div className="flex flex-col">
        <span>{item.label}</span>
        {item.note && <span className="text-[11px] text-muted-foreground">{item.note}</span>}
      </div>
      <span className={`tabular-nums ${cls}`}>{positive ? "+" : "-"}₪{fmt(item.amount)}</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-xs text-muted-foreground py-1">{msg}</div>;
}

function FinSubsection({
  title,
  items,
  showDetails,
  warn,
  onOpen,
}: {
  title: string;
  items: PreviewLineItem[];
  showDetails: boolean;
  warn?: boolean;
  onOpen?: (item: PreviewLineItem) => void;
}) {
  if (items.length === 0) return null;
  const total = items.reduce((s, x) => s + x.amount, 0);
  return (
    <div className={`rounded-md border p-2 ${warn ? "border-amber-500/40 bg-amber-500/5" : "border-border/60"}`}>
      <div className="flex items-center justify-between mb-1">
        {title && <span className="text-xs font-semibold">{title}</span>}
        <span className="text-xs font-bold text-rose-600 tabular-nums">-₪{fmt(total)}</span>
      </div>
      {showDetails && (
        <HRTable>
          <HRTHead>
            <HRTH>التاريخ</HRTH>
            <HRTH>الوصف</HRTH>
            <HRTH>المصدر / المرجع</HRTH>
            <HRTH>المبلغ</HRTH>
            <HRTH>—</HRTH>
          </HRTHead>
          <tbody>
            {items.map((it) => (
              <HRTR key={it.id}>
                <HRTD numeric>{it.date || "—"}</HRTD>
                <HRTD>
                  <div className="flex flex-col">
                    <span>{it.label}</span>
                    {it.note && <span className="text-[10px] text-muted-foreground">{it.note}</span>}
                  </div>
                </HRTD>
                <HRTD className="text-xs">
                  <div className="flex flex-col gap-0.5">
                    {it.sourceLabel && (
                      <Badge variant="outline" className="text-[10px] w-fit">{it.sourceLabel}</Badge>
                    )}
                    {it.reference && <span className="text-muted-foreground">{it.reference}</span>}
                    {!it.sourceLabel && !it.reference && <span className="text-muted-foreground">—</span>}
                  </div>
                </HRTD>
                <HRTD numeric className="text-rose-600 font-semibold">
                  <HRMoney value={it.amount} />
                </HRTD>
                <HRTD>
                  {onOpen && it.sourceKind && it.sourceKind !== "computed" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpen(it)}>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </HRTD>
              </HRTR>
            ))}
          </tbody>
        </HRTable>
      )}
    </div>
  );
}
