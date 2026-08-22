import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay } from "@/lib/utils";
import { formatDepartureMinutes } from "@/lib/attendance-departures";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { AlertTriangle, RefreshCw, Download } from "lucide-react";

type Row = {
  employee_id: string;
  full_name: string;
  branch_id: string | null;
  attendance_date: string;
  minutes: number;
  gaps_count: number;
  over_minutes: number;
  cap_minutes: number;
};

/**
 * سجل تاريخي لتجاوزات سقف المغادرات — قراءة فقط، لا يؤثر على الساعات ولا الرواتب.
 * مصدر الحساب: دالة قاعدة البيانات hr_departure_violations (نفس منطق باقي الشاشات).
 */
/** قراءة السياق المشترك مع تبويبَي الحضور الشهري/اليومي:
 *  الموظف المحدد والفترة المعروضة — حتى يبقى التنقل بين التبويبات سلساً
 *  بدون إعادة اختيار الموظف أو التواريخ (نفس مفاتيح MonthlyAttendanceTab). */
function readAttendanceContext(): { empName: string; from: string | null; to: string | null } {
  let empName = "";
  let from: string | null = null;
  let to: string | null = null;
  try {
    const rawEmp = sessionStorage.getItem("hr:attendance:employee");
    if (rawEmp) {
      const parsed = JSON.parse(rawEmp) as { id?: string; name?: string };
      if (parsed?.id && parsed.id !== "all" && parsed.name) empName = parsed.name;
    }
  } catch { /* ignore */ }
  try {
    const rawPeriod = sessionStorage.getItem("hr:attendance:period");
    if (rawPeriod) {
      const parsed = JSON.parse(rawPeriod) as { from?: string; to?: string };
      if (parsed?.from && parsed?.to) { from = parsed.from; to = parsed.to; }
    }
  } catch { /* ignore */ }
  return { empName, from, to };
}

export default function DepartureViolationsTab() {
  const ctx = useMemo(readAttendanceContext, []);
  const [from, setFrom] = useState(ctx.from || format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(ctx.to || format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(ctx.empName);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("hr_departure_violations", { _from: from, _to: to });
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e: any) {
      toast({ title: "تعذّر تحميل التجاوزات", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => !search.trim() || (r.full_name || "").includes(search.trim())),
    [rows, search],
  );

  const byEmployee = useMemo(() => {
    const m = new Map<string, { name: string; days: number; over: number }>();
    filtered.forEach((r) => {
      const cur = m.get(r.employee_id) || { name: r.full_name, days: 0, over: 0 };
      cur.days += 1;
      cur.over += r.over_minutes || 0;
      m.set(r.employee_id, cur);
    });
    return [...m.values()].sort((a, b) => b.over - a.over);
  }, [filtered]);

  const exportCsv = () => {
    const head = ["الموظف", "التاريخ", "مجموع المغادرات (د)", "عدد المغادرات", "السقف (د)", "التجاوز (د)"];
    const lines = filtered.map((r) =>
      [r.full_name, r.attendance_date, r.minutes, r.gaps_count, r.cap_minutes, r.over_minutes].join(","),
    );
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `departure-violations-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <span className="text-xs text-muted-foreground">بحث باسم الموظف</span>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الموظف..." dir="rtl" />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} className="gap-1">
          <Download className="h-3.5 w-3.5" /> تصدير
        </Button>
      </Card>

      {byEmployee.length > 0 && (
        <Card className="p-3">
          <p className="text-sm font-medium mb-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> ملخّص التجاوزات ({byEmployee.length} موظف)
          </p>
          <div className="flex flex-wrap gap-2">
            {byEmployee.map((e) => (
              <Badge key={e.name} variant="outline" className="border-amber-400 text-amber-700">
                {e.name}: {e.days} يوم — إجمالي التجاوز {formatDepartureMinutes(e.over)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الموظف</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">مجموع المغادرات</TableHead>
              <TableHead className="text-right">عدد المغادرات</TableHead>
              <TableHead className="text-right">السقف</TableHead>
              <TableHead className="text-right">التجاوز</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filtered.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  {loading ? "جارِ التحميل..." : "لا يوجد تجاوزات في هذه الفترة"}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={`${r.employee_id}-${r.attendance_date}`}>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{fmtDateDisplay(r.attendance_date)}</TableCell>
                <TableCell>{formatDepartureMinutes(r.minutes)}</TableCell>
                <TableCell>{r.gaps_count}</TableCell>
                <TableCell>{r.cap_minutes} د</TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-red-400 text-red-600">
                    +{formatDepartureMinutes(r.over_minutes)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
