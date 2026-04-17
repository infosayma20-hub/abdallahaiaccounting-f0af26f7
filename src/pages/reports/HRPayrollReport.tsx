import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Users, DollarSign, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";

import { setNextExportBranding } from "@/lib/excel-export";
const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const HRPayrollReport = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const { data: payrollData, isLoading } = useQuery({
    queryKey: ["hr-payroll-report", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payroll")
        .select("*, employees(full_name, department, job_title)")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    if (!payrollData?.length) return { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 };
    return payrollData.reduce((acc, p) => ({
      totalBase: acc.totalBase + Number(p.base_salary),
      totalAllowances: acc.totalAllowances + Number(p.total_allowances),
      totalDeductions: acc.totalDeductions + Number(p.total_deductions),
      totalNet: acc.totalNet + Number(p.net_salary),
      count: acc.count + 1,
      paidCount: acc.paidCount + (p.is_paid ? 1 : 0),
    }), { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 });
  }, [payrollData]);

  const fmt = (n: number) => `₪ ${n.toLocaleString("en", { minimumFractionDigits: 2 })}`;

  const exportExcel = () => {
    if (!payrollData?.length) return;
    const rows = payrollData.map((p: any) => ({
      "الموظف": p.employees?.full_name || "-",
      "القسم": p.employees?.department || "-",
      "الراتب الأساسي": Number(p.base_salary),
      "البدلات": Number(p.total_allowances),
      "الإضافي": Number(p.total_overtime),
      "الخصومات": Number(p.total_deductions),
      "الصافي": Number(p.net_salary),
      "الحالة": p.is_paid ? "مدفوع" : "غير مدفوع",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الرواتب");
    setNextExportBranding({ title: "الرواتب" });
    XLSX.writeFile(wb, `رواتب_${months[selectedMonth - 1]}_${selectedYear}.xlsx`);
  };

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">تقرير الرواتب الشهري</h1>
            <p className="text-xs text-muted-foreground">{months[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!payrollData?.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الرواتب", value: fmt(summary.totalBase), icon: DollarSign, color: "text-blue-500" },
          { label: "إجمالي البدلات", value: fmt(summary.totalAllowances), icon: TrendingDown, color: "text-emerald-500" },
          { label: "إجمالي الخصومات", value: fmt(summary.totalDeductions), icon: TrendingDown, color: "text-red-500" },
          { label: "صافي الرواتب", value: fmt(summary.totalNet), icon: Wallet, color: "text-primary" },
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

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الأساسي</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">البدلات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الإضافي</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الخصومات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الصافي</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : !payrollData?.length ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد بيانات رواتب لهذه الفترة</td></tr>
              ) : (
                <>
                  {payrollData.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium text-foreground">{p.employees?.full_name || "-"}</td>
                      <td className="p-3 text-muted-foreground">{p.employees?.department || "-"}</td>
                      <td className="p-3">{fmt(Number(p.base_salary))}</td>
                      <td className="p-3 text-emerald-600">{fmt(Number(p.total_allowances))}</td>
                      <td className="p-3">{fmt(Number(p.total_overtime))}</td>
                      <td className="p-3 text-red-500">{fmt(Number(p.total_deductions))}</td>
                      <td className="p-3 font-bold">{fmt(Number(p.net_salary))}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${p.is_paid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                          {p.is_paid ? "مدفوع" : "غير مدفوع"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="p-3" colSpan={2}>الإجمالي ({summary.count} موظف)</td>
                    <td className="p-3">{fmt(summary.totalBase)}</td>
                    <td className="p-3 text-emerald-600">{fmt(summary.totalAllowances)}</td>
                    <td className="p-3">-</td>
                    <td className="p-3 text-red-500">{fmt(summary.totalDeductions)}</td>
                    <td className="p-3">{fmt(summary.totalNet)}</td>
                    <td className="p-3 text-center text-[10px]">{summary.paidCount}/{summary.count}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default HRPayrollReport;
