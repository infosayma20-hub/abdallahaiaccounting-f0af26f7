import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, RefreshCw, ChevronDown, ChevronLeft, Pencil, AlertCircle, Building2, Users, Sun, Moon, Clock, TrendingUp, DollarSign, Gauge } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateDisplay } from "@/lib/utils";
import { setNextExportBranding } from "@/lib/excel-export";
import { formatHrTime } from "@/lib/hr/hrTimeDisplay";

type Dept = {
  department: string;
  employees_count: number;
  day_hours: number;
  evening_hours: number;
  total_hours: number;
  overtime_hours: number;
};

type Row = {
  branch_id: string | null;
  branch_name: string;
  date: string;
  employees_count: number;
  morning_employees?: number;
  evening_employees?: number;
  day_hours: number;
  evening_hours: number;
  total_hours: number;
  overtime_hours: number;
  morning_overtime?: number;
  evening_overtime?: number;
  adjustments_count: number;
  sales_total: number;
  morning_sales?: number;
  evening_sales?: number;
  sales_per_hour: number;
  departments?: Dept[];
  hourly_sales?: number[];
};

type Detail = {
  branch_id: string | null;
  branch_name: string;
  date: string;
  employee_id: string;
  employee_name: string;
  department: string;
  position: string;
  shift: string;
  shift_class?: "morning" | "mid" | "evening" | "unknown";
  first_check_in: string | null;
  last_check_out: string | null;
  break_minutes: number;
  day_hours: number;
  evening_hours: number;
  total_hours: number;
  overtime_hours: number;
  morning_overtime?: number;
  evening_overtime?: number;
  status: string;
  is_manually_adjusted: boolean;
  adjustments_count: number;
};

const ALL = "__all__";

const STATUS_LABEL: Record<string, { ar: string; cls: string }> = {
  present:    { ar: "حاضر",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  late:       { ar: "متأخر",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  absent:     { ar: "غائب",   cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  incomplete: { ar: "ناقص",   cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  leave:      { ar: "إجازة",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  holiday:    { ar: "عطلة",   cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

interface Props {
  hideBack?: boolean;
  portalTheme?: "light" | "dark";
}

export default function HRBranchHoursReport({ hideBack = false, portalTheme }: Props) {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return format(d, "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [branchId, setBranchId] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // branch|date keys — employee details
  const [viewMode, setViewMode] = useState<"day-grid" | "table">("day-grid");

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["hr-branch-hours", dateFrom, dateTo, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("malaki-data", {
        body: {
          action: "branch_hours_report",
          date_from: dateFrom,
          date_to: dateTo,
          branch_id: branchId === ALL ? null : branchId,
        },
      });
      if (error) throw error;
      return data as { success: boolean; rows: Row[]; details: Detail[]; branches: { id: string; name: string }[]; meta?: any };
    },
  });

  const rows = data?.rows || [];
  const details = data?.details || [];
  const branches = data?.branches || [];

  // Group rows by date (desc), each date holds all its branches
  const groupedByDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.branch_name.localeCompare(b.branch_name));
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const detailsIndex = useMemo(() => {
    const m = new Map<string, Detail[]>();
    for (const d of details) {
      const k = `${d.branch_id || "__none__"}|${d.date}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return m;
  }, [details]);

  const totals = useMemo(() => rows.reduce(
    (a, r) => ({
      day: a.day + r.day_hours,
      eve: a.eve + r.evening_hours,
      total: a.total + r.total_hours,
      ot: a.ot + r.overtime_hours,
      mOt: a.mOt + (r.morning_overtime || 0),
      eOt: a.eOt + (r.evening_overtime || 0),
      sales: a.sales + r.sales_total,
      mSales: a.mSales + (r.morning_sales || 0),
      eSales: a.eSales + (r.evening_sales || 0),
      adj: a.adj + r.adjustments_count,
    }),
    { day: 0, eve: 0, total: 0, ot: 0, mOt: 0, eOt: 0, sales: 0, mSales: 0, eSales: 0, adj: 0 }
  ), [rows]);

  const salesPerHour = totals.total > 0 ? totals.sales / totals.total : 0;

  const toggleRow = (k: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const exportExcel = () => {
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary per branch/day
    const sum = rows.map(r => ({
      "الفرع": r.branch_name,
      "التاريخ": fmtDateDisplay(r.date),
      "الموظفين": r.employees_count,
      "ساعات صباحي": r.day_hours.toFixed(2),
      "ساعات مسائي": r.evening_hours.toFixed(2),
      "إجمالي (صافي)": r.total_hours.toFixed(2),
      "إضافي صباحي": (r.morning_overtime || 0).toFixed(2),
      "إضافي مسائي": (r.evening_overtime || 0).toFixed(2),
      "إضافي إجمالي": r.overtime_hours.toFixed(2),
      "تعديلات HR": r.adjustments_count,
      "مبيعات صباحي ₪": (r.morning_sales || 0).toFixed(2),
      "مبيعات مسائي ₪": (r.evening_sales || 0).toFixed(2),
      "المبيعات ₪": r.sales_total.toFixed(2),
      "مبيعات/ساعة": r.sales_per_hour.toFixed(2),
    }));
    const ws1 = XLSX.utils.json_to_sheet(sum);
    ws1["!cols"] = Object.keys(sum[0] || {}).map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws1, "ملخص الفروع");

    // Sheet 2 — Detailed per employee/day
    if (details.length) {
      const det = details.map(d => ({
        "الفرع": d.branch_name,
        "التاريخ": fmtDateDisplay(d.date),
        "الموظف": d.employee_name,
        "القسم": d.department,
        "المسمى": d.position,
        "الوردية": d.shift,
        "تصنيف": d.shift_class === "morning" ? "صباحي" : d.shift_class === "evening" ? "مسائي" : d.shift_class === "mid" ? "ميد" : "-",
        "الحضور": d.first_check_in ? formatHrTime(d.first_check_in, "HH:mm") : "-",
        "الانصراف": d.last_check_out ? formatHrTime(d.last_check_out, "HH:mm") : "-",
        "استراحة (د)": d.break_minutes,
        "ساعات صباحي": d.day_hours.toFixed(2),
        "ساعات مسائي": d.evening_hours.toFixed(2),
        "الإجمالي (صافي)": d.total_hours.toFixed(2),
        "إضافي صباحي": (d.morning_overtime || 0).toFixed(2),
        "إضافي مسائي": (d.evening_overtime || 0).toFixed(2),
        "إضافي إجمالي": d.overtime_hours.toFixed(2),
        "الحالة": STATUS_LABEL[d.status]?.ar || d.status,
        "تعديل يدوي": d.is_manually_adjusted ? "نعم" : "لا",
        "تعديلات معتمدة": d.adjustments_count,
      }));
      const ws2 = XLSX.utils.json_to_sheet(det);
      ws2["!cols"] = Object.keys(det[0]).map(() => ({ wch: 15 }));
      XLSX.utils.book_append_sheet(wb, ws2, "تفصيل الموظفين");
    }

    setNextExportBranding({ title: "ساعات الفروع والمبيعات" });
    XLSX.writeFile(wb, `ساعات_الفروع_${dateFrom}_${dateTo}.xlsx`);
  };

  const isPortal = !!portalTheme;

  // Sales timeline component — 24-hour bar chart
  const SalesTimeline = ({ hourly, max }: { hourly: number[]; max: number }) => {
    return (
      <div className="mt-2">
        <div className="flex items-end gap-[2px] h-14" dir="ltr">
          {hourly.map((v, h) => {
            const pct = max > 0 ? (v / max) * 100 : 0;
            const peak = v > 0 && v === Math.max(...hourly);
            return (
              <div key={h} className="flex-1 flex flex-col items-center group relative">
                <div
                  className={`w-full rounded-t transition-colors ${
                    peak ? "bg-emerald-500" : v > 0 ? "bg-emerald-400/70" : "bg-muted"
                  }`}
                  style={{ height: `${Math.max(pct, v > 0 ? 4 : 2)}%` }}
                />
                {v > 0 && (
                  <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-foreground text-background text-[9px] rounded px-1.5 py-0.5 whitespace-nowrap z-10 pointer-events-none">
                    {String(h).padStart(2, "0")}:00 — ₪{v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground mt-1 px-0.5" dir="ltr">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {!hideBack && (
            <button
              onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/reports"))}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowRight className="h-5 w-5 text-foreground" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">ساعات دوام الفروع والمبيعات</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
            <button
              onClick={() => setViewMode("day-grid")}
              className={`px-2.5 py-1 ${viewMode === "day-grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >عرض يومي</button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-2.5 py-1 ${viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >جدول</button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-[200px] h-9 text-xs">
            <SelectValue placeholder="الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفروع</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "إجمالي الساعات (صافي)", value: totals.total.toFixed(1), sub: "بعد خصم الاستراحة" },
          { label: "ساعات صباحي", value: totals.day.toFixed(1), sub: "٩ص–٥م + ميد قبل ٥" },
          { label: "ساعات مسائي", value: totals.eve.toFixed(1), sub: "٥م–النهاية + ميد بعد ٥" },
          { label: "إضافي صباحي / مسائي", value: `${totals.mOt.toFixed(1)} / ${totals.eOt.toFixed(1)}`, sub: `الإجمالي ${totals.ot.toFixed(1)}` },
          { label: "مبيعات صباحي / مسائي ₪", value: `${totals.mSales.toLocaleString("en-US", { maximumFractionDigits: 0 })} / ${totals.eSales.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, sub: `الإجمالي ${totals.sales.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
          { label: "متوسط ₪/ساعة", value: salesPerHour.toFixed(1), sub: "مبيعات ÷ ساعات" },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">{s.label}</p>
            <p className="text-base font-bold text-foreground">{s.value}</p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">{s.sub}</p>
          </Card>
        ))}
      </div>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> تعذر تحميل التقرير: {(error as Error).message}
        </Card>
      )}

      {/* DAY-CENTRIC VIEW: for each date, branches shown side-by-side as cards */}
      {viewMode === "day-grid" && (
        <div className="space-y-6">
          {isFetching && !rows.length ? (
            <Card className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</Card>
          ) : !groupedByDate.length ? (
            <Card className="p-8 text-center text-muted-foreground text-sm">لا توجد بيانات للفترة المحددة</Card>
          ) : groupedByDate.map(([date, brs]) => {
            const dayTotals = brs.reduce((a, r) => ({
              emp: a.emp + r.employees_count,
              hours: a.hours + r.total_hours,
              ot: a.ot + r.overtime_hours,
              sales: a.sales + r.sales_total,
            }), { emp: 0, hours: 0, ot: 0, sales: 0 });
            // Shared y-axis for hourly charts within this day (used only inside expanded panels)
            const dayMaxHour = Math.max(1, ...brs.flatMap(r => r.hourly_sales || [0]));
            return (
              <div key={date}>
                {/* Day header strip */}
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b-2 border-primary/20">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold text-sm">
                      {fmtDateDisplay(date)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {brs.length} فروع · {dayTotals.emp} حضور · {dayTotals.hours.toFixed(1)} ساعة · {dayTotals.ot.toFixed(1)} إضافي · ₪{dayTotals.sales.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
                {/* Compact stacked rows (one per branch) */}
                <div className="flex flex-col gap-2">
                  {brs.map(r => {
                    const k = `${r.branch_id || "__none__"}|${r.date}`;
                    const isOpen = expanded.has(k);
                    const empDetails = detailsIndex.get(k) || [];
                    const depts = r.departments || [];
                    const hourly = r.hourly_sales || [];
                    return (
                      <Card key={k} className="overflow-hidden">
                        {/* Compact branch row — always visible */}
                        <button
                          onClick={() => toggleRow(k)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-right"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <div className="flex items-center gap-2 min-w-[110px] shrink-0">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-bold text-sm text-foreground truncate">{r.branch_name}</span>
                            {r.adjustments_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                <Pencil className="h-2.5 w-2.5" />{r.adjustments_count}
                              </span>
                            )}
                          </div>
                          {/* Metric chips */}
                          <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 justify-end text-[11px]" dir="ltr">
                            <span className="inline-flex items-center gap-1">
                              <span className="text-muted-foreground">حضور</span>
                              <span className="font-bold text-foreground tabular-nums">{r.employees_count}</span>
                              {(r.morning_employees != null && r.evening_employees != null) && (
                                <span className="text-[9px] text-muted-foreground tabular-nums">
                                  ({r.morning_employees}/{r.evening_employees})
                                </span>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-sky-600 dark:text-sky-400">صباحي</span>
                              <span className="font-bold text-foreground tabular-nums">{r.day_hours.toFixed(1)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-indigo-600 dark:text-indigo-400">مسائي</span>
                              <span className="font-bold text-foreground tabular-nums">{r.evening_hours.toFixed(1)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-muted-foreground">إجمالي</span>
                              <span className="font-bold text-foreground tabular-nums">{r.total_hours.toFixed(1)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-amber-600 dark:text-amber-400">إضافي</span>
                              <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">{r.overtime_hours.toFixed(1)}</span>
                              {(r.morning_overtime != null || r.evening_overtime != null) && r.overtime_hours > 0 && (
                                <span className="text-[9px] text-muted-foreground tabular-nums">
                                  ({(r.morning_overtime || 0).toFixed(1)}/{(r.evening_overtime || 0).toFixed(1)})
                                </span>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-emerald-600 dark:text-emerald-400">مبيعات ₪</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{r.sales_total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                              {(r.morning_sales != null || r.evening_sales != null) && r.sales_total > 0 && (
                                <span className="text-[9px] text-muted-foreground tabular-nums">
                                  ({(r.morning_sales || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}/{(r.evening_sales || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                                </span>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-muted-foreground">₪/س</span>
                              <span className="font-bold text-foreground tabular-nums">{r.sales_per_hour > 0 ? r.sales_per_hour.toFixed(1) : "-"}</span>
                            </span>
                          </div>
                        </button>

                        {/* Expanded panel */}
                        {isOpen && (
                          <div className="border-t border-border/60 p-3 space-y-3 bg-muted/10">
                            {/* Departments breakdown */}
                            {depts.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">توزيع الساعات حسب الأقسام</p>
                                <div className="rounded-lg border border-border/50 overflow-x-auto">
                                  <table className="w-full text-[10px]">
                                    <thead>
                                      <tr className="bg-muted/30 text-muted-foreground">
                                        <th className="p-1.5 text-right font-semibold">القسم</th>
                                        <th className="p-1.5 text-center font-semibold">عدد</th>
                                        <th className="p-1.5 text-center font-semibold">٩–٥</th>
                                        <th className="p-1.5 text-center font-semibold">مسائي</th>
                                        <th className="p-1.5 text-center font-semibold">إجمالي</th>
                                        <th className="p-1.5 text-center font-semibold">إضافي</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {depts.map((d, i) => (
                                        <tr key={i} className="border-t border-border/30">
                                          <td className="p-1.5 font-medium text-foreground">{d.department}</td>
                                          <td className="p-1.5 text-center">{d.employees_count}</td>
                                          <td className="p-1.5 text-center">{d.day_hours.toFixed(1)}</td>
                                          <td className="p-1.5 text-center">{d.evening_hours.toFixed(1)}</td>
                                          <td className="p-1.5 text-center font-semibold">{d.total_hours.toFixed(1)}</td>
                                          <td className="p-1.5 text-center text-amber-600">{d.overtime_hours > 0 ? d.overtime_hours.toFixed(1) : "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Hourly sales timeline */}
                            {hourly.some(v => v > 0) && (
                              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-900/30 p-2.5">
                                <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">توزيع المبيعات على مدار اليوم</p>
                                <SalesTimeline hourly={hourly} max={dayMaxHour} />
                              </div>
                            )}

                            {/* Employees table */}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">تفصيل الموظفين ({empDetails.length})</p>
                              <div className="rounded-lg border border-border/40 overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="bg-muted/40 text-muted-foreground">
                                  <th className="p-1.5 text-right">الموظف</th>
                                  <th className="p-1.5 text-right">القسم</th>
                                  <th className="p-1.5 text-right">الوردية</th>
                                  <th className="p-1.5 text-center">دخول</th>
                                  <th className="p-1.5 text-center">خروج</th>
                                  <th className="p-1.5 text-center">صافي</th>
                                  <th className="p-1.5 text-center">إضافي</th>
                                  <th className="p-1.5 text-center">الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {empDetails.length === 0 ? (
                                  <tr><td colSpan={8} className="p-2 text-center text-muted-foreground">لا يوجد</td></tr>
                                ) : empDetails.map(d => {
                                  const st = STATUS_LABEL[d.status] || { ar: d.status, cls: "bg-muted text-muted-foreground" };
                                  return (
                                    <tr key={d.employee_id} className="border-t border-border/30">
                                      <td className="p-1.5 font-medium text-foreground">
                                        {d.employee_name}
                                        {d.is_manually_adjusted && <Pencil className="h-2.5 w-2.5 inline mr-1 text-blue-600" />}
                                      </td>
                                      <td className="p-1.5 text-muted-foreground">{d.department}</td>
                                      <td className="p-1.5 text-muted-foreground truncate max-w-[80px]">{d.shift}</td>
                                      <td className="p-1.5 text-center">{d.first_check_in ? formatHrTime(d.first_check_in, "HH:mm") : "-"}</td>
                                      <td className="p-1.5 text-center">{d.last_check_out ? formatHrTime(d.last_check_out, "HH:mm") : "-"}</td>
                                      <td className="p-1.5 text-center font-semibold">{d.total_hours.toFixed(1)}</td>
                                      <td className="p-1.5 text-center text-amber-600">{d.overtime_hours > 0 ? d.overtime_hours.toFixed(1) : "-"}</td>
                                      <td className="p-1.5 text-center">
                                        <span className={`px-1 py-0.5 rounded text-[8px] ${st.cls}`}>{st.ar}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Classic table view (unchanged) */}
      {viewMode === "table" && (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 w-8"></th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الفرع</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">موظفين</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">٩–٥</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">٥–النهاية</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">إجمالي</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">إضافي</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">تعديلات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">مبيعات ₪</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">₪/ساعة</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !rows.length ? (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">لا توجد بيانات للفترة المحددة</td></tr>
              ) : (
                rows.flatMap(r => {
                  const k = `${r.branch_id || "__none__"}|${r.date}`;
                  const isOpen = expanded.has(k);
                  const empDetails = detailsIndex.get(k) || [];
                  const parent = (
                    <tr key={k} className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => toggleRow(k)}>
                      <td className="p-3 text-center">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 inline" /> : <ChevronLeft className="h-3.5 w-3.5 inline" />}
                      </td>
                      <td className="p-3 font-semibold text-foreground">{r.branch_name}</td>
                      <td className="p-3">{fmtDateDisplay(r.date)}</td>
                      <td className="p-3 text-center">{r.employees_count}</td>
                      <td className="p-3">{r.day_hours.toFixed(1)}</td>
                      <td className="p-3">{r.evening_hours.toFixed(1)}</td>
                      <td className="p-3 font-semibold">{r.total_hours.toFixed(1)}</td>
                      <td className="p-3 text-amber-600">{r.overtime_hours.toFixed(1)}</td>
                      <td className="p-3 text-center">
                        {r.adjustments_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            <Pencil className="h-2.5 w-2.5" /> {r.adjustments_count}
                          </span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="p-3">{r.sales_total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="p-3 text-emerald-600">{r.sales_per_hour > 0 ? r.sales_per_hour.toFixed(1) : "-"}</td>
                    </tr>
                  );
                  if (!isOpen) return [parent];
                  const expandedRow = (
                    <tr key={k + "_details"} className="bg-muted/10">
                      <td colSpan={11} className="p-0">
                        <div className="p-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-2">
                            تفصيل الموظفين ({empDetails.length})
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-border/40">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="bg-muted/40">
                                  <th className="p-2 text-right font-semibold text-muted-foreground">الموظف</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">القسم</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">المسمى</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">الوردية</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">دخول</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">خروج</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">استراحة</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">٩–٥</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">٥–النهاية</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">صافي</th>
                                  <th className="p-2 text-right font-semibold text-muted-foreground">إضافي</th>
                                  <th className="p-2 text-center font-semibold text-muted-foreground">الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {empDetails.length === 0 ? (
                                  <tr><td colSpan={12} className="p-3 text-center text-muted-foreground">لا يوجد موظفون مسجلون لهذا اليوم</td></tr>
                                ) : empDetails.map(d => {
                                  const st = STATUS_LABEL[d.status] || { ar: d.status, cls: "bg-muted text-muted-foreground" };
                                  return (
                                    <tr key={d.employee_id + d.date} className="border-t border-border/30 hover:bg-muted/20">
                                      <td className="p-2 font-medium text-foreground">
                                        {d.employee_name}
                                        {d.is_manually_adjusted && (
                                          <span title="تم تعديل السجل يدوياً" className="inline-block mr-1 text-blue-600">
                                            <Pencil className="h-2.5 w-2.5 inline" />
                                          </span>
                                        )}
                                        {d.adjustments_count > 0 && (
                                          <span className="mr-1 text-[9px] text-blue-600">+{d.adjustments_count}</span>
                                        )}
                                      </td>
                                      <td className="p-2 text-muted-foreground">{d.department}</td>
                                      <td className="p-2 text-muted-foreground">{d.position}</td>
                                      <td className="p-2 text-muted-foreground">{d.shift}</td>
                                      <td className="p-2">{d.first_check_in ? formatHrTime(d.first_check_in, "HH:mm") : "-"}</td>
                                      <td className="p-2">{d.last_check_out ? formatHrTime(d.last_check_out, "HH:mm") : "-"}</td>
                                      <td className="p-2">{d.break_minutes > 0 ? `${d.break_minutes}د` : "-"}</td>
                                      <td className="p-2">{d.day_hours.toFixed(1)}</td>
                                      <td className="p-2">{d.evening_hours.toFixed(1)}</td>
                                      <td className="p-2 font-semibold">{d.total_hours.toFixed(1)}</td>
                                      <td className="p-2 text-amber-600">{d.overtime_hours > 0 ? d.overtime_hours.toFixed(1) : "-"}</td>
                                      <td className="p-2 text-center">
                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${st.cls}`}>{st.ar}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                  return [parent, expandedRow];
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-bold border-t-2 border-border">
                  <td className="p-3" colSpan={4}>الإجمالي</td>
                  <td className="p-3">{totals.day.toFixed(1)}</td>
                  <td className="p-3">{totals.eve.toFixed(1)}</td>
                  <td className="p-3">{totals.total.toFixed(1)}</td>
                  <td className="p-3 text-amber-600">{totals.ot.toFixed(1)}</td>
                  <td className="p-3 text-center text-blue-600">{totals.adj || "-"}</td>
                  <td className="p-3">{totals.sales.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  <td className="p-3 text-emerald-600">{salesPerHour.toFixed(1)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
      )}
    </div>
  );
}