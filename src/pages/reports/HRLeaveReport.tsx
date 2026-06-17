import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Calendar, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";

import { setNextExportBranding } from "@/lib/excel-export";
const HRLeaveReport = () => {
  const navigate = useNavigate();

  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["hr-leave-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, department, annual_leave_days, sick_leave_days")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: leaves, isLoading: loadingLeaves } = useQuery({
    queryKey: ["hr-leave-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_leaves")
        .select("employee_id, leave_type, days_count, status")
        .eq("status", "approved");
      if (error) throw error;
      return data || [];
    },
  });

  const reportData = useMemo(() => {
    if (!employees?.length) return [];
    const leaveMap = new Map<string, { annual: number; sick: number; other: number }>();
    (leaves || []).forEach(l => {
      const curr = leaveMap.get(l.employee_id) || { annual: 0, sick: 0, other: 0 };
      if (l.leave_type === "سنوية") curr.annual += Number(l.days_count);
      else if (l.leave_type === "مرضية") curr.sick += Number(l.days_count);
      else curr.other += Number(l.days_count);
      leaveMap.set(l.employee_id, curr);
    });
    return employees.map(e => {
      const used = leaveMap.get(e.id) || { annual: 0, sick: 0, other: 0 };
      return {
        ...e,
        annualUsed: used.annual,
        annualRemaining: e.annual_leave_days - used.annual,
        sickUsed: used.sick,
        sickRemaining: e.sick_leave_days - used.sick,
        otherUsed: used.other,
      };
    });
  }, [employees, leaves]);

  const isLoading = loadingEmp || loadingLeaves;

  const exportExcel = () => {
    if (!reportData.length) return;
    const rows = reportData.map(r => ({
      "الموظف": r.full_name,
      "القسم": r.department || "-",
      "رصيد سنوي": r.annual_leave_days,
      "مستخدم سنوي": r.annualUsed,
      "متبقي سنوي": r.annualRemaining,
      "رصيد مرضي": r.sick_leave_days,
      "مستخدم مرضي": r.sickUsed,
      "متبقي مرضي": r.sickRemaining,
      "إجازات أخرى": r.otherUsed,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الإجازات");
    setNextExportBranding({ title: "الإجازات" });
    XLSX.writeFile(wb, "تقرير_رصيد_الإجازات.xlsx");
  };

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">تقرير رصيد الإجازات</h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!reportData.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-center font-semibold text-muted-foreground" colSpan={3}>الإجازة السنوية</th>
                <th className="p-3 text-center font-semibold text-muted-foreground" colSpan={3}>الإجازة المرضية</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">أخرى</th>
              </tr>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-2"></th>
                <th className="p-2"></th>
                <th className="p-2 text-center text-[10px] text-muted-foreground">الرصيد</th>
                <th className="p-2 text-center text-[10px] text-muted-foreground">مستخدم</th>
                <th className="p-2 text-center text-[10px] text-muted-foreground">متبقي</th>
                <th className="p-2 text-center text-[10px] text-muted-foreground">الرصيد</th>
                <th className="p-2 text-center text-[10px] text-muted-foreground">مستخدم</th>
                <th className="p-2 text-center text-[10px] text-muted-foreground">متبقي</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : !reportData.length ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">لا توجد بيانات موظفين</td></tr>
              ) : (
                reportData.map(r => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="p-3 font-medium text-foreground">{r.full_name}</td>
                    <td className="p-3 text-muted-foreground">{r.department || "-"}</td>
                    <td className="p-3 text-center">{r.annual_leave_days}</td>
                    <td className="p-3 text-center text-amber-600">{r.annualUsed}</td>
                    <td className={`p-3 text-center font-bold ${r.annualRemaining <= 3 ? "text-red-500" : "text-emerald-600"}`}>{r.annualRemaining}</td>
                    <td className="p-3 text-center">{r.sick_leave_days}</td>
                    <td className="p-3 text-center text-amber-600">{r.sickUsed}</td>
                    <td className={`p-3 text-center font-bold ${r.sickRemaining <= 3 ? "text-red-500" : "text-emerald-600"}`}>{r.sickRemaining}</td>
                    <td className="p-3 text-center">{r.otherUsed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default HRLeaveReport;
