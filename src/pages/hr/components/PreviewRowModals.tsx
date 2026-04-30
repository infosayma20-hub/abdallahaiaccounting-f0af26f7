/**
 * Row-level investigation modals for /payroll/preview-all.
 *
 * Four read-only modals, all RTL, all Arabic, all sourced from real DB data
 * (no extrapolation, no guessing). They give the accountant the audit trail:
 *
 *   1. كشف البصمات        — raw attendance_events for the employee in the month.
 *   2. أيام العمل         — daily attendance_days roll-up (present / late / absent).
 *   3. البدلات والخصومات  — every component the engine considered, with `source`.
 *   4. تفاصيل الراتب      — full breakdown of how net was reached, per row.
 *
 * NO writes. NO calculation here — values come from the parent page's already
 * computed payslip + the engine's `_engine.component_breakdown` provenance.
 */

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { HRTable, HRTHead, HRTH, HRTR, HRTD, HRMoney } from "./HRTable";
import { Loader2, Info } from "lucide-react";

const fmtNum = (n: number, d = 1) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n || 0));

const monthRange = (year: number, month: number) => {
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
};

// ─────────────────────────────────────────────────────────────────
// 1) كشف البصمات
// ─────────────────────────────────────────────────────────────────
export function PunchesModal({
  open,
  onClose,
  employeeId,
  employeeName,
  year,
  month,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
}) {
  const { start, end } = monthRange(year, month);
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["preview-punches", employeeId, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_events")
        .select("id,event_time,event_type,status,branch_id,notes")
        .eq("employee_id", employeeId)
        .gte("event_time", `${start}T00:00:00`)
        .lte("event_time", `${end}T23:59:59`)
        .order("event_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>كشف البصمات — {employeeName}</DialogTitle>
          <DialogDescription>المصدر: سجل البصمات الفعلي (attendance_events) — قراءة فقط</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحميل...
          </div>
        ) : events.length === 0 ? (
          <EmptyState text="لا توجد بصمات مسجّلة لهذا الموظف خلال الشهر." />
        ) : (
          <HRTable>
            <HRTHead>
              <HRTH>التاريخ</HRTH>
              <HRTH>الوقت</HRTH>
              <HRTH>النوع</HRTH>
              <HRTH>الحالة</HRTH>
              <HRTH>ملاحظات</HRTH>
            </HRTHead>
            <tbody>
              {events.map((e: any) => {
                const dt = new Date(e.event_time);
                return (
                  <HRTR key={e.id}>
                    <HRTD numeric>{format(dt, "yyyy/MM/dd", { locale: ar })}</HRTD>
                    <HRTD numeric>{format(dt, "HH:mm")}</HRTD>
                    <HRTD>
                      <Badge variant={e.event_type === "check_in" ? "default" : "secondary"}>
                        {e.event_type === "check_in" ? "دخول" : e.event_type === "check_out" ? "خروج" : e.event_type}
                      </Badge>
                    </HRTD>
                    <HRTD>
                      <span className="text-xs text-muted-foreground">{e.status || "—"}</span>
                    </HRTD>
                    <HRTD>
                      <span className="text-xs">{e.notes || "—"}</span>
                    </HRTD>
                  </HRTR>
                );
              })}
            </tbody>
          </HRTable>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2) أيام العمل
// ─────────────────────────────────────────────────────────────────
export function WorkdaysModal({
  open,
  onClose,
  employeeId,
  employeeName,
  year,
  month,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
}) {
  const { start, end } = monthRange(year, month);
  const { data: days = [], isLoading } = useQuery({
    queryKey: ["preview-workdays", employeeId, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_days")
        .select("attendance_date,total_hours,overtime_hours,status,first_check_in,last_check_out")
        .eq("employee_id", employeeId)
        .gte("attendance_date", start)
        .lte("attendance_date", end)
        .order("attendance_date", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: open,
  });

  const summary = {
    present: days.filter((d) => ["present", "late", "incomplete"].includes(d.status)).length,
    late: days.filter((d) => d.status === "late").length,
    absent: days.filter((d) => d.status === "absent").length,
    leave: days.filter((d) => ["leave", "vacation", "annual_leave", "sick"].includes(d.status)).length,
  };

  const labelFor = (s: string) => {
    const map: Record<string, string> = {
      present: "حاضر",
      late: "متأخر",
      absent: "غائب",
      incomplete: "غير مكتمل",
      leave: "إجازة",
      vacation: "إجازة",
      annual_leave: "إجازة سنوية",
      sick: "مرضي",
      holiday: "عطلة",
      weekend: "عطلة أسبوعية",
    };
    return map[s] || s;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>أيام العمل — {employeeName}</DialogTitle>
          <DialogDescription>المصدر: ملخّص الحضور اليومي (attendance_days)</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 mb-3">
          <SummaryChip label="حاضر" value={summary.present} tone="ok" />
          <SummaryChip label="متأخر" value={summary.late} tone="warn" />
          <SummaryChip label="غائب" value={summary.absent} tone="bad" />
          <SummaryChip label="إجازات" value={summary.leave} tone="info" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحميل...
          </div>
        ) : days.length === 0 ? (
          <EmptyState text="لا توجد أيام حضور مسجّلة لهذا الشهر." />
        ) : (
          <HRTable>
            <HRTHead>
              <HRTH>التاريخ</HRTH>
              <HRTH>دخول</HRTH>
              <HRTH>خروج</HRTH>
              <HRTH>ساعات العمل</HRTH>
              <HRTH>إضافي</HRTH>
              <HRTH>الحالة</HRTH>
            </HRTHead>
            <tbody>
              {days.map((d: any) => (
                <HRTR key={d.attendance_date}>
                  <HRTD numeric>{format(new Date(d.attendance_date), "yyyy/MM/dd", { locale: ar })}</HRTD>
                  <HRTD numeric>{d.first_check_in ? format(new Date(d.first_check_in), "HH:mm") : "—"}</HRTD>
                  <HRTD numeric>{d.last_check_out ? format(new Date(d.last_check_out), "HH:mm") : "—"}</HRTD>
                  <HRTD numeric>{fmtNum(d.total_hours)}</HRTD>
                  <HRTD numeric>{fmtNum(d.overtime_hours)}</HRTD>
                  <HRTD>
                    <Badge variant="outline" className="text-xs">{labelFor(d.status)}</Badge>
                  </HRTD>
                </HRTR>
              ))}
            </tbody>
          </HRTable>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// 3) البدلات والخصومات
// ─────────────────────────────────────────────────────────────────
export interface BreakdownEntry {
  code: string;
  name: string;
  kind: "allowance" | "deduction";
  amount: number;
  source: string;
  attendance_linked?: boolean;
  applied: boolean;
}

export function ComponentsModal({
  open,
  onClose,
  employeeName,
  policyName,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  policyName: string | null;
  entries: BreakdownEntry[];
}) {
  const allowances = entries.filter((e) => e.kind === "allowance");
  const deductions = entries.filter((e) => e.kind === "deduction");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>البدلات والخصومات — {employeeName}</DialogTitle>
          <DialogDescription>
            {policyName
              ? `سياسة الرواتب: ${policyName}`
              : "لا توجد سياسة رواتب مرتبطة بهذا الموظف — يستخدم النظام الافتراضي."}
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            <Info className="h-4 w-4 inline ms-1" />
            لا توجد بدلات أو خصومات في سياسة الشركة لهذا الموظف.
          </div>
        ) : (
          <div className="space-y-4">
            <SectionTable title="البدلات" rows={allowances} tone="ok" emptyText="لا توجد بدلات." />
            <SectionTable title="الخصومات" rows={deductions} tone="bad" emptyText="لا توجد خصومات." />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionTable({
  title,
  rows,
  tone,
  emptyText,
}: {
  title: string;
  rows: BreakdownEntry[];
  tone: "ok" | "bad";
  emptyText: string;
}) {
  return (
    <div>
      <h4 className={`text-sm font-semibold mb-2 ${tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{emptyText}</p>
      ) : (
        <HRTable>
          <HRTHead>
            <HRTH>الكود</HRTH>
            <HRTH>البيان</HRTH>
            <HRTH>القيمة</HRTH>
            <HRTH>المصدر</HRTH>
            <HRTH>مرتبط بالحضور</HRTH>
            <HRTH>مطبّق</HRTH>
          </HRTHead>
          <tbody>
            {rows.map((r, i) => (
              <HRTR key={`${r.code}-${i}`}>
                <HRTD>{r.code}</HRTD>
                <HRTD>{r.name}</HRTD>
                <HRTD numeric className={tone === "ok" ? "text-emerald-700" : "text-rose-700"}>
                  <HRMoney value={r.amount} />
                </HRTD>
                <HRTD>
                  <span className="text-[11px] text-muted-foreground font-mono">{r.source}</span>
                </HRTD>
                <HRTD>
                  <Badge variant="outline" className="text-xs">
                    {r.attendance_linked ? "نعم" : "لا"}
                  </Badge>
                </HRTD>
                <HRTD>
                  {r.applied ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">نعم</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">لا</Badge>
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

// ─────────────────────────────────────────────────────────────────
// 4) تفاصيل الراتب
// ─────────────────────────────────────────────────────────────────
export interface SalaryBreakdown {
  base_salary: number;
  working_days: number;
  working_hours: number;
  attendance_salary: number;
  overtime_hours: number;
  overtime_value: number;
  total_allowances: number;
  total_deductions: number;
  net_salary: number;
  warnings: string[];
}

export function SalaryDetailsModal({
  open,
  onClose,
  employeeName,
  data,
}: {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  data: SalaryBreakdown;
}) {
  const verifySum = data.attendance_salary + data.total_allowances - data.total_deductions;
  const matches = Math.abs(verifySum - data.net_salary) < 0.5;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>تفاصيل احتساب الراتب — {employeeName}</DialogTitle>
          <DialogDescription>تفصيل لحظي — كل رقم له مصدر</DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <Line label="الراتب الأساسي" value={data.base_salary} />
          <Line label="أيام العمل" value={data.working_days} format="num" />
          <Line label="ساعات العمل" value={data.working_hours} format="num" />
          <Line label="راتب الحضور" value={data.attendance_salary} />
          <Line label="الساعات الإضافية" value={data.overtime_hours} format="num" />
          <Line label="قيمة الإضافي" value={data.overtime_value} />
          <div className="my-2 border-t" />
          <Line label="إجمالي البدلات" value={data.total_allowances} tone="ok" />
          <Line label="إجمالي الخصومات" value={data.total_deductions} tone="bad" />
          <div className="my-2 border-t" />
          <Line label="الصافي" value={data.net_salary} tone="primary" big />

          <div
            className={`mt-3 rounded-md border p-2 text-xs ${
              matches ? "border-emerald-300 bg-emerald-50/40 text-emerald-700" : "border-amber-300 bg-amber-50/40 text-amber-700"
            }`}
          >
            تحقّق المعادلة: راتب الحضور + البدلات − الخصومات ={" "}
            <strong className="tabular-nums">
              {fmtNum(verifySum, 2)} ₪
            </strong>{" "}
            {matches ? "✓ مطابق للصافي" : "✗ غير مطابق — يحتاج مراجعة"}
          </div>

          {data.warnings.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/40 p-2 text-xs text-amber-800 space-y-1">
              <div className="font-semibold">تنبيهات المحرّك:</div>
              {data.warnings.map((w, i) => (
                <div key={i} className="font-mono">• {w}</div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────
function Line({
  label,
  value,
  tone,
  big,
  format = "currency",
}: {
  label: string;
  value: number;
  tone?: "ok" | "bad" | "primary";
  big?: boolean;
  format?: "currency" | "num";
}) {
  const colorCls =
    tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`${big ? "text-sm font-semibold" : "text-xs text-muted-foreground"}`}>{label}</span>
      <span className={`tabular-nums ${big ? "text-base font-bold" : "text-sm"} ${colorCls}`}>
        {format === "currency" ? `${fmtNum(value, 2)} ₪` : fmtNum(value, 2)}
      </span>
    </div>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "bad" | "info" }) {
  const cls = {
    ok: "border-emerald-300 bg-emerald-50/40 text-emerald-700",
    warn: "border-amber-300 bg-amber-50/40 text-amber-700",
    bad: "border-rose-300 bg-rose-50/40 text-rose-700",
    info: "border-sky-300 bg-sky-50/40 text-sky-700",
  }[tone];
  return (
    <div className={`rounded-md border p-2 text-center ${cls}`}>
      <div className="text-[10px]">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      <Info className="h-4 w-4 inline ms-1" />
      {text}
    </div>
  );
}