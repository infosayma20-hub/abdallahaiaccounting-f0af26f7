import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, RefreshCw } from "lucide-react";
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

type Row = {
  branch_id: string | null;
  branch_name: string;
  date: string;
  employees_count: number;
  day_hours: number;
  evening_hours: number;
  total_hours: number;
  overtime_hours: number;
  sales_total: number;
};

const ALL = "__all__";

interface Props {
  /** إخفاء زر الرجوع (مثلاً داخل بوابة الادارة) */
  hideBack?: boolean;
  /** ثيم البوابة (اختياري) */
  portalTheme?: "light" | "dark";
}

export default function HRBranchHoursReport({ hideBack = false }: Props) {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return format(d, "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [branchId, setBranchId] = useState<string>(ALL);

  const { data, isFetching, refetch } = useQuery({
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
      return data as { success: boolean; rows: Row[]; branches: { id: string; name: string }[] };
    },
  });

  const rows = data?.rows || [];
  const branches = data?.branches || [];

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        day: a.day + r.day_hours,
        eve: a.eve + r.evening_hours,
        total: a.total + r.total_hours,
        ot: a.ot + r.overtime_hours,
        sales: a.sales + r.sales_total,
      }),
      { day: 0, eve: 0, total: 0, ot: 0, sales: 0 }
    );
  }, [rows]);

  const salesPerHour = totals.total > 0 ? totals.sales / totals.total : 0;

  const exportExcel = () => {
    if (!rows.length) return;
    const data = rows.map((r) => ({
      "الفرع": r.branch_name,
      "التاريخ": fmtDateDisplay(r.date),
      "الموظفين": r.employees_count,
      "ساعات 9-5": r.day_hours.toFixed(2),
      "ساعات 5-النهاية": r.evening_hours.toFixed(2),
      "إجمالي الساعات": r.total_hours.toFixed(2),
      "الإضافي": r.overtime_hours.toFixed(2),
      "المبيعات": r.sales_total.toFixed(2),
      "مبيعات/ساعة": r.total_hours > 0 ? (r.sales_total / r.total_hours).toFixed(2) : "0.00",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ساعات الفروع");
    setNextExportBranding({ title: "ساعات الفروع" });
    XLSX.writeFile(wb, `ساعات_الفروع_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-10" dir="rtl">
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
            <p className="text-xs text-muted-foreground mt-0.5">
              مقسّمة ٩ص–٥م / ٥م–انتهاء الدوام لتحديد الساعات التشغيلية اللازمة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue placeholder="الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفروع</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "إجمالي الساعات", value: totals.total.toFixed(1) },
          { label: "ساعات ٩–٥", value: totals.day.toFixed(1) },
          { label: "ساعات ٥–النهاية", value: totals.eve.toFixed(1) },
          { label: "الإضافي", value: totals.ot.toFixed(1) },
          { label: "مبيعات/ساعة (₪)", value: salesPerHour.toFixed(1) },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">{s.label}</p>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الفرع</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">موظفين</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">ساعات ٩–٥</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">ساعات ٥–النهاية</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">إجمالي الساعات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">إضافي</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">المبيعات ₪</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">مبيعات/ساعة</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !rows.length ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="p-3 font-medium text-foreground">{r.branch_name}</td>
                    <td className="p-3">{fmtDateDisplay(r.date)}</td>
                    <td className="p-3 text-center">{r.employees_count}</td>
                    <td className="p-3">{r.day_hours.toFixed(1)}</td>
                    <td className="p-3">{r.evening_hours.toFixed(1)}</td>
                    <td className="p-3 font-semibold">{r.total_hours.toFixed(1)}</td>
                    <td className="p-3 text-amber-600">{r.overtime_hours.toFixed(1)}</td>
                    <td className="p-3">{r.sales_total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="p-3 text-emerald-600">
                      {r.total_hours > 0 ? (r.sales_total / r.total_hours).toFixed(1) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-bold">
                  <td className="p-3" colSpan={3}>الإجمالي</td>
                  <td className="p-3">{totals.day.toFixed(1)}</td>
                  <td className="p-3">{totals.eve.toFixed(1)}</td>
                  <td className="p-3">{totals.total.toFixed(1)}</td>
                  <td className="p-3 text-amber-600">{totals.ot.toFixed(1)}</td>
                  <td className="p-3">{totals.sales.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  <td className="p-3 text-emerald-600">{salesPerHour.toFixed(1)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}