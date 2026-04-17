import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { fmtDateDisplay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { format } from "date-fns";

import { setNextExportBranding } from "@/lib/excel-export";
const HRAttendanceReport = () => {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return format(d, "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data: attendanceData, isLoading } = useQuery({
    queryKey: ["hr-attendance-report", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_days")
        .select("*, employees!attendance_days_employee_id_fkey(full_name, department)")
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    if (!attendanceData?.length) return { total: 0, present: 0, absent: 0, late: 0, totalHours: 0, totalOvertime: 0 };
    return attendanceData.reduce((acc, d) => ({
      total: acc.total + 1,
      present: acc.present + (d.status === "present" ? 1 : 0),
      absent: acc.absent + (d.status === "absent" ? 1 : 0),
      late: acc.late + (d.status === "late" ? 1 : 0),
      totalHours: acc.totalHours + Number(d.total_hours || 0),
      totalOvertime: acc.totalOvertime + Number(d.overtime_hours || 0),
    }), { total: 0, present: 0, absent: 0, late: 0, totalHours: 0, totalOvertime: 0 });
  }, [attendanceData]);

  const statusLabel = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      present: { label: "حاضر", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
      absent: { label: "غائب", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
      late: { label: "متأخر", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
      leave: { label: "إجازة", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    };
    return map[s] || { label: s, cls: "bg-muted text-muted-foreground" };
  };

  const exportExcel = () => {
    if (!attendanceData?.length) return;
    const rows = attendanceData.map((d: any) => ({
      "الموظف": d.employees?.full_name || "-",
      "القسم": d.employees?.department || "-",
      "التاريخ": fmtDateDisplay(d.attendance_date),
      "الحضور": d.first_check_in ? format(new Date(d.first_check_in), "HH:mm") : "-",
      "الانصراف": d.last_check_out ? format(new Date(d.last_check_out), "HH:mm") : "-",
      "الساعات": Number(d.total_hours || 0).toFixed(1),
      "الإضافي": Number(d.overtime_hours || 0).toFixed(1),
      "الحالة": statusLabel(d.status).label,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحضور");
    setNextExportBranding({ title: "الحضور" });
    XLSX.writeFile(wb, `تقرير_الحضور_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">تقرير الحضور والانصراف</h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!attendanceData?.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي السجلات", value: summary.total, icon: Clock, color: "text-blue-500" },
          { label: "حاضر", value: summary.present, icon: CheckCircle, color: "text-emerald-500" },
          { label: "غائب", value: summary.absent, icon: AlertTriangle, color: "text-red-500" },
          { label: "ساعات إضافية", value: summary.totalOvertime.toFixed(1), icon: Clock, color: "text-amber-500" },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الحضور</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الانصراف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الساعات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">إضافي</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : !attendanceData?.length ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد بيانات حضور للفترة المحددة</td></tr>
              ) : (
                attendanceData.map((d: any) => {
                  const st = statusLabel(d.status);
                  return (
                    <tr key={d.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium text-foreground">{d.employees?.full_name || "-"}</td>
                      <td className="p-3 text-muted-foreground">{d.employees?.department || "-"}</td>
                      <td className="p-3">{fmtDateDisplay(d.attendance_date)}</td>
                      <td className="p-3">{d.first_check_in ? format(new Date(d.first_check_in), "HH:mm") : "-"}</td>
                      <td className="p-3">{d.last_check_out ? format(new Date(d.last_check_out), "HH:mm") : "-"}</td>
                      <td className="p-3">{Number(d.total_hours || 0).toFixed(1)}</td>
                      <td className="p-3">{Number(d.overtime_hours || 0).toFixed(1)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default HRAttendanceReport;
