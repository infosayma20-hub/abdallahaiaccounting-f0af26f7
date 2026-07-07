import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { fmtDateDisplay } from "@/lib/utils";
import { SortableHeader, applySort, cycleSort, noSort, type SortState } from "./SortableHeader";

type TenureEmp = {
  id: string;
  full_name: string;
  employee_number: string | null;
  department: string | null;
  branch_id: string | null;
  job_title: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_terminated: boolean | null;
};

type BucketKey = "all" | "lt1" | "1to3" | "3to5" | "gt5";
type StatusKey = "active" | "terminated" | "all";

function diffYMD(startISO: string, endISO: string) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) {
    return { years: 0, months: 0, days: 0, totalDays: 0 };
  }
  let years = e.getFullYear() - s.getFullYear();
  let months = e.getMonth() - s.getMonth();
  let days = e.getDate() - s.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(e.getFullYear(), e.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.floor((e.getTime() - s.getTime()) / 86400000);
  return { years, months, days, totalDays };
}

function labelYM(years: number, months: number): string {
  const parts: string[] = [];
  if (years > 0) parts.push(years === 1 ? "سنة" : years === 2 ? "سنتان" : `${years} سنوات`);
  if (months > 0) parts.push(months === 1 ? "شهر" : months === 2 ? "شهران" : `${months} أشهر`);
  if (parts.length === 0) return "أقل من شهر";
  return parts.join(" و ");
}

function bucketOf(years: number): Exclude<BucketKey, "all"> {
  if (years < 1) return "lt1";
  if (years < 3) return "1to3";
  if (years < 5) return "3to5";
  return "gt5";
}

export default function HRTenureTab({
  branchFilterId,
  branchName,
}: {
  branchFilterId: string; // "all" or branch id — mirrors parent filter
  branchName: (id: string | null) => string;
}) {
  const { dataOwnerId } = useDataOwnerId();
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<BucketKey>("all");
  const [status, setStatus] = useState<StatusKey>("active");
  const [colBranch, setColBranch] = useState<string>("all");
  const [colDept, setColDept] = useState<string>("all");
  const [sort, setSort] = useState<SortState>({ key: "totalDays", dir: "desc" });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr-tenure-employees", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,full_name,employee_number,department,branch_id,job_title,position,start_date,end_date,is_active,is_terminated")
        .eq("user_id", dataOwnerId!);
      if (error) throw error;
      return (data || []) as TenureEmp[];
    },
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const rows = useMemo(() => {
    return employees
      .filter((e) => !!e.start_date)
      .map((e) => {
        const endISO = e.end_date && (e.is_terminated || !e.is_active) ? e.end_date : today;
        const d = diffYMD(e.start_date!, endISO);
        const isActive = e.is_active && !e.is_terminated;
        return {
          emp: e,
          branch: branchName(e.branch_id),
          startISO: e.start_date!,
          endISO,
          years: d.years,
          months: d.months,
          totalDays: d.totalDays,
          durationLabel: labelYM(d.years, d.months),
          bucket: bucketOf(d.years),
          isActive,
        };
      });
  }, [employees, branchName, today]);

  const branchOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.branch && r.branch !== "-") s.add(r.branch); });
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);
  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.emp.department) s.add(r.emp.department); });
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = rows.filter((r) => {
      if (status === "active" && !r.isActive) return false;
      if (status === "terminated" && r.isActive) return false;
      if (bucket !== "all" && r.bucket !== bucket) return false;
      if (branchFilterId !== "all" && r.emp.branch_id !== branchFilterId) return false;
      if (colBranch !== "all" && r.branch !== colBranch) return false;
      if (colDept !== "all" && (r.emp.department || "") !== colDept) return false;
      if (q) {
        const hay = [
          r.emp.full_name,
          r.emp.employee_number || "",
          r.branch,
          r.emp.department || "",
          r.emp.job_title || "",
          r.emp.position || "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return applySort(base, sort, {
      employee: (r) => r.emp.full_name,
      number: (r) => r.emp.employee_number || "",
      branch: (r) => r.branch,
      department: (r) => r.emp.department || "",
      jobTitle: (r) => r.emp.job_title || r.emp.position || "",
      startISO: (r) => r.startISO,
      totalDays: (r) => r.totalDays,
      duration: (r) => r.totalDays,
      status: (r) => (r.isActive ? 1 : 0),
    });
  }, [rows, status, bucket, branchFilterId, colBranch, colDept, q, sort]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const totalYears = filtered.reduce((s, r) => s + r.totalDays / 365.25, 0);
    const avg = total > 0 ? totalYears / total : 0;
    const buckets = { lt1: 0, "1to3": 0, "3to5": 0, gt5: 0 } as Record<Exclude<BucketKey, "all">, number>;
    filtered.forEach((r) => { buckets[r.bucket] += 1; });
    return { total, avgYears: avg, buckets };
  }, [filtered]);

  const exportExcel = () => {
    const data = filtered.map((r, i) => ({
      "#": i + 1,
      "الرقم الوظيفي": r.emp.employee_number || "-",
      "الاسم": r.emp.full_name,
      "الفرع": r.branch,
      "القسم": r.emp.department || "-",
      "المسمى الوظيفي": r.emp.job_title || r.emp.position || "-",
      "تاريخ بدء العمل": fmtDateDisplay(r.startISO),
      "تاريخ اليوم": fmtDateDisplay(r.endISO),
      "مدة العمل": r.durationLabel,
      "عدد الأيام": r.totalDays,
      "الحالة": r.isActive ? "نشط" : "منتهي",
    }));
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 5 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 16 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مدة_الخدمة");
    setNextExportBranding({ title: "مدة_الخدمة" });
    XLSX.writeFile(wb, `مدة_الخدمة.xlsx`);
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-sm font-semibold">مدة خدمة الموظفين</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 print:grid-cols-6" dir="rtl">
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">الإجمالي</div>
          <div className="text-lg font-bold tabular-nums">{stats.total}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">متوسط المدة (سنة)</div>
          <div className="text-lg font-bold tabular-nums">{stats.avgYears.toFixed(1)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">أقل من سنة</div>
          <div className="text-lg font-bold tabular-nums">{stats.buckets.lt1}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">1 - 3 سنوات</div>
          <div className="text-lg font-bold tabular-nums">{stats.buckets["1to3"]}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">3 - 5 سنوات</div>
          <div className="text-lg font-bold tabular-nums">{stats.buckets["3to5"]}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">أكثر من 5 سنوات</div>
          <div className="text-lg font-bold tabular-nums">{stats.buckets.gt5}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم، الرقم، الفرع، أو المسمى..." className="pr-8 h-9 text-sm" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={status === "active" ? "default" : "outline"} onClick={() => setStatus("active")} className="h-9 text-xs">النشطون</Button>
          <Button size="sm" variant={status === "terminated" ? "default" : "outline"} onClick={() => setStatus("terminated")} className="h-9 text-xs">المنتهية خدمتهم</Button>
          <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")} className="h-9 text-xs">الكل</Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={bucket === "all" ? "default" : "outline"} onClick={() => setBucket("all")} className="h-9 text-xs">كل الشرائح</Button>
          <Button size="sm" variant={bucket === "lt1" ? "default" : "outline"} onClick={() => setBucket("lt1")} className="h-9 text-xs">أقل من سنة</Button>
          <Button size="sm" variant={bucket === "1to3" ? "default" : "outline"} onClick={() => setBucket("1to3")} className="h-9 text-xs">1 - 3</Button>
          <Button size="sm" variant={bucket === "3to5" ? "default" : "outline"} onClick={() => setBucket("3to5")} className="h-9 text-xs">3 - 5</Button>
          <Button size="sm" variant={bucket === "gt5" ? "default" : "outline"} onClick={() => setBucket("gt5")} className="h-9 text-xs">+5</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات مطابقة</div>
        ) : (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-sm" dir="rtl">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-center font-semibold w-12">#</th>
                  <SortableHeader label="الرقم" columnKey="number" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                  <SortableHeader label="الاسم" columnKey="employee" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} className="sticky right-0 bg-muted/50 min-w-[160px]" />
                  <SortableHeader label="الفرع" columnKey="branch" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))}
                    filterValue={colBranch} filterOptions={[{ value: "all", label: "كل الفروع" }, ...branchOptions]} onFilterChange={setColBranch} />
                  <SortableHeader label="القسم" columnKey="department" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))}
                    filterValue={colDept} filterOptions={[{ value: "all", label: "كل الأقسام" }, ...deptOptions]} onFilterChange={setColDept} />
                  <SortableHeader label="المسمى الوظيفي" columnKey="jobTitle" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} />
                  <SortableHeader label="تاريخ بدء العمل" columnKey="startISO" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                  <th className="px-3 py-2 text-center font-semibold">تاريخ اليوم</th>
                  <SortableHeader label="مدة العمل" columnKey="duration" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                  <SortableHeader label="عدد الأيام" columnKey="totalDays" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                  <SortableHeader label="الحالة" columnKey="status" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.emp.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.emp.employee_number || "-"}</td>
                    <td className="px-3 py-2 sticky right-0 bg-card font-medium">{r.emp.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.branch}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.emp.department || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.emp.job_title || r.emp.position || "-"}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmtDateDisplay(r.startISO)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{fmtDateDisplay(r.endISO)}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className="border-primary/40 text-primary">{r.durationLabel}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.totalDays.toLocaleString("en-US")}</td>
                    <td className="px-3 py-2 text-center">
                      {r.isActive
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">نشط</Badge>
                        : <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">منتهي</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold text-xs">
                  <td colSpan={11} className="px-3 py-2 text-right text-muted-foreground">
                    عرض {filtered.length} موظف • متوسط مدة الخدمة: {stats.avgYears.toFixed(1)} سنة
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}