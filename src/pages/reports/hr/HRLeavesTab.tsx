import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, X, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { fmtDateDisplay } from "@/lib/utils";

type EmployeeLite = {
  id: string;
  full_name: string;
  department: string | null;
  branch_id: string | null;
  annual_leave_balance: number | null;
  annual_leave_days: number | null;
  previous_year_balance: number | null;
};

type LeaveRow = {
  id: string;
  employee_id: string;
  leave_type: string;
  status: string | null;
  start_date: string;
  end_date: string;
  days_count: number | null;
  reason: string | null;
  review_notes: string | null;
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "سنوية",
  sick: "مرضية",
  unpaid: "بدون راتب",
  emergency: "طارئة",
  maternity: "أمومة",
  paternity: "أبوة",
  bereavement: "وفاة",
  hajj: "حج",
  marriage: "زواج",
  other: "أخرى",
};
const labelLeaveType = (t: string) => LEAVE_TYPE_LABELS[t?.toLowerCase()] || t || "—";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { label: "معتمد", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  rejected: { label: "مرفوض", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelled: { label: "ملغي", cls: "bg-muted text-muted-foreground" },
};

export default function HRLeavesTab({
  employees,
  branchName,
  dateFrom,
  dateTo,
  loading: parentLoading,
}: {
  employees: EmployeeLite[];
  branchName: (id: string | null) => string;
  dateFrom: string;
  dateTo: string;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [drill, setDrill] = useState<{ title: string; rows: LeaveRow[] } | null>(null);

  // Pull all leave_requests for the year (for balance/used calc) and the period (for "during selected period")
  const yearStart = useMemo(() => `${dateFrom.slice(0, 4)}-01-01`, [dateFrom]);
  const yearEnd = useMemo(() => `${dateFrom.slice(0, 4)}-12-31`, [dateFrom]);

  const { data: leaves, isLoading } = useQuery({
    queryKey: ["hr-reports-leaves", yearStart, yearEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id,employee_id,leave_type,status,start_date,end_date,days_count,reason,review_notes")
        .gte("start_date", yearStart)
        .lte("start_date", yearEnd);
      if (error) throw error;
      return (data || []) as LeaveRow[];
    },
  });

  const byEmployee = useMemo(() => {
    const m = new Map<string, LeaveRow[]>();
    (leaves || []).forEach((l) => {
      const arr = m.get(l.employee_id) || [];
      arr.push(l);
      m.set(l.employee_id, arr);
    });
    return m;
  }, [leaves]);

  type Row = {
    emp: EmployeeLite;
    branch: string;
    annualEntitlement: number | null;
    annualUsed: number;
    annualRemaining: number | null;
    sickUsed: number;
    unpaidUsed: number;
    pendingCount: number;
    lastLeaveDate: string | null;
    all: LeaveRow[];
    annualApproved: LeaveRow[];
    sickApproved: LeaveRow[];
    pending: LeaveRow[];
    unpaidApproved: LeaveRow[];
  };

  const rows = useMemo<Row[]>(() => {
    return employees.map((emp) => {
      const all = (byEmployee.get(emp.id) || []).slice().sort((a, b) => b.start_date.localeCompare(a.start_date));
      const sumDays = (arr: LeaveRow[]) => arr.reduce((s, l) => s + Number(l.days_count || 0), 0);
      const annualApproved = all.filter((l) => (l.leave_type || "").toLowerCase() === "annual" && l.status === "approved");
      const sickApproved = all.filter((l) => (l.leave_type || "").toLowerCase() === "sick" && l.status === "approved");
      const unpaidApproved = all.filter((l) => (l.leave_type || "").toLowerCase() === "unpaid" && l.status === "approved");
      const pending = all.filter((l) => l.status === "pending");
      const annualUsed = sumDays(annualApproved);
      const sickUsed = sumDays(sickApproved);
      const unpaidUsed = sumDays(unpaidApproved);
      // entitlement: use annual_leave_days (yearly entitlement); annual_leave_balance is "remaining" but we recompute when entitlement exists
      const annualEntitlement =
        emp.annual_leave_days != null && emp.annual_leave_days > 0
          ? emp.annual_leave_days + Number(emp.previous_year_balance || 0)
          : null;
      const annualRemaining = annualEntitlement != null ? Math.max(0, annualEntitlement - annualUsed) : null;
      return {
        emp,
        branch: branchName(emp.branch_id),
        annualEntitlement,
        annualUsed,
        annualRemaining,
        sickUsed,
        unpaidUsed,
        pendingCount: pending.length,
        lastLeaveDate: all[0]?.start_date || null,
        all,
        annualApproved,
        sickApproved,
        pending,
        unpaidApproved,
      };
    });
  }, [employees, byEmployee, branchName]);

  const q = query.trim().toLowerCase();
  const filtered = !q
    ? rows
    : rows.filter(
        (r) =>
          r.emp.full_name.toLowerCase().includes(q) ||
          (r.branch || "").toLowerCase().includes(q) ||
          (r.emp.department || "").toLowerCase().includes(q),
      );

  const exportExcel = () => {
    const data = filtered.map((r) => ({
      "الموظف": r.emp.full_name,
      "الفرع": r.branch,
      "القسم": r.emp.department || "-",
      "الرصيد السنوي": r.annualEntitlement ?? "غير محدد",
      "المستخدم السنوي": r.annualUsed,
      "المتبقي السنوي": r.annualRemaining ?? "غير محدد",
      "المرضي المستخدم": r.sickUsed,
      "إجازات غير مدفوعة": r.unpaidUsed,
      "طلبات قيد المراجعة": r.pendingCount,
      "آخر إجازة": r.lastLeaveDate ? fmtDateDisplay(r.lastLeaveDate) : "—",
      "الحالة": r.annualEntitlement == null ? "يحتاج ضبط السياسة" : "—",
    }));
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير_الإجازات");
    setNextExportBranding({ title: "تقرير_الإجازات" });
    XLSX.writeFile(wb, `تقرير_الإجازات_${dateFrom}_${dateTo}.xlsx`);
  };

  const openDrill = (title: string, list: LeaveRow[]) => setDrill({ title, rows: list });

  const loading = parentLoading || isLoading;

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-sm font-semibold">تقرير الإجازات السنوية والمرضية</h2>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث: اسم الموظف، الفرع، أو القسم..."
            className="pr-8 h-9 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Badge variant="outline" className="text-[11px]">
          سنة الاحتساب: {dateFrom.slice(0, 4)}
        </Badge>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات</div>
        ) : (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-sm" dir="rtl">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right px-3 py-2 font-semibold sticky right-0 bg-muted/50 min-w-[150px]">الموظف</th>
                  <th className="text-right px-3 py-2 font-semibold">الفرع</th>
                  <th className="text-right px-3 py-2 font-semibold">القسم</th>
                  <th className="text-center px-3 py-2 font-semibold">الرصيد السنوي</th>
                  <th className="text-center px-3 py-2 font-semibold">المستخدم السنوي</th>
                  <th className="text-center px-3 py-2 font-semibold">المتبقي السنوي</th>
                  <th className="text-center px-3 py-2 font-semibold">المرضي المستخدم</th>
                  <th className="text-center px-3 py-2 font-semibold">إجازات غير مدفوعة</th>
                  <th className="text-center px-3 py-2 font-semibold">قيد المراجعة</th>
                  <th className="text-center px-3 py-2 font-semibold">آخر إجازة</th>
                  <th className="text-right px-3 py-2 font-semibold">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.emp.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 sticky right-0 bg-card font-medium">{r.emp.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.branch}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.emp.department || "-"}</td>
                    <td className="px-3 py-2 text-center">
                      {r.annualEntitlement != null ? r.annualEntitlement : <span className="text-[11px] text-amber-600">غير محدد</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        className="text-primary hover:underline disabled:no-underline disabled:text-muted-foreground"
                        disabled={r.annualApproved.length === 0}
                        onClick={() => openDrill(`الإجازات السنوية المستخدمة — ${r.emp.full_name}`, r.annualApproved)}
                      >
                        {r.annualUsed}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.annualRemaining != null ? (
                        <span className={r.annualRemaining < 3 ? "text-red-600 font-semibold" : "text-emerald-600"}>{r.annualRemaining}</span>
                      ) : (
                        <span className="text-[11px] text-amber-600">غير محدد</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        className="text-primary hover:underline disabled:no-underline disabled:text-muted-foreground"
                        disabled={r.sickApproved.length === 0}
                        onClick={() => openDrill(`الإجازات المرضية — ${r.emp.full_name}`, r.sickApproved)}
                      >
                        {r.sickUsed}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        className="text-primary hover:underline disabled:no-underline disabled:text-muted-foreground"
                        disabled={r.unpaidApproved.length === 0}
                        onClick={() => openDrill(`إجازات غير مدفوعة — ${r.emp.full_name}`, r.unpaidApproved)}
                      >
                        {r.unpaidUsed}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        className="text-amber-600 hover:underline disabled:no-underline disabled:text-muted-foreground"
                        disabled={r.pending.length === 0}
                        onClick={() => openDrill(`طلبات قيد المراجعة — ${r.emp.full_name}`, r.pending)}
                      >
                        {r.pendingCount}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                      {r.lastLeaveDate ? fmtDateDisplay(r.lastLeaveDate) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.annualEntitlement == null ? (
                        <span className="text-amber-600">يحتاج ضبط السياسة</span>
                      ) : r.annualRemaining != null && r.annualRemaining < 3 ? (
                        <span className="text-red-600">رصيد منخفض</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold text-xs">
                  <td colSpan={11} className="px-3 py-2 text-right text-muted-foreground">
                    عرض {filtered.length} من {rows.length} موظف
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[11px] text-muted-foreground print:hidden">
        ملاحظة: الرصيد السنوي = ‎(annual_leave_days + previous_year_balance)‎ من بطاقة الموظف. إذا غير معرّف يظهر "غير محدد" دون احتساب وهمي. المستخدم يحسب من طلبات الإجازة المعتمدة فقط ضمن السنة الحالية.
      </p>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{drill?.title}</DialogTitle>
          </DialogHeader>
          {!drill || drill.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">لا توجد سجلات</div>
          ) : (
            <div className="overflow-auto max-h-[60vh] border rounded-md">
              <table className="w-full text-sm" dir="rtl">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2 font-semibold">من تاريخ</th>
                    <th className="text-right px-3 py-2 font-semibold">إلى تاريخ</th>
                    <th className="text-right px-3 py-2 font-semibold">النوع</th>
                    <th className="text-center px-3 py-2 font-semibold">الأيام</th>
                    <th className="text-right px-3 py-2 font-semibold">الحالة</th>
                    <th className="text-right px-3 py-2 font-semibold">السبب</th>
                    <th className="text-right px-3 py-2 font-semibold">ملاحظات HR</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.rows.map((l) => {
                    const st = STATUS_LABELS[l.status || "pending"] || { label: l.status || "—", cls: "bg-muted" };
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="px-3 py-2 tabular-nums">{fmtDateDisplay(l.start_date)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtDateDisplay(l.end_date)}</td>
                        <td className="px-3 py-2">{labelLeaveType(l.leave_type)}</td>
                        <td className="px-3 py-2 text-center">{l.days_count ?? "—"}</td>
                        <td className="px-3 py-2"><Badge className={st.cls}>{st.label}</Badge></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{l.reason || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{l.review_notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}