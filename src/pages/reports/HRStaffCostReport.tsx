import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

import { setNextExportBranding } from "@/lib/excel-export";
const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const HRStaffCostReport = () => {
  const navigate = useNavigate();

  const { data: employees, isLoading } = useQuery({
    queryKey: ["hr-staff-cost"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, department, base_salary, is_active")
        .eq("is_active", true)
        .order("department");
      if (error) throw error;
      return data || [];
    },
  });

  const deptData = useMemo(() => {
    if (!employees?.length) return [];
    const map = new Map<string, { count: number; totalSalary: number }>();
    employees.forEach(e => {
      const dept = e.department || "غير محدد";
      const curr = map.get(dept) || { count: 0, totalSalary: 0 };
      curr.count += 1;
      curr.totalSalary += Number(e.base_salary);
      map.set(dept, curr);
    });
    return Array.from(map.entries())
      .map(([dept, data]) => ({ dept, ...data }))
      .sort((a, b) => b.totalSalary - a.totalSalary);
  }, [employees]);

  const totalCost = deptData.reduce((s, d) => s + d.totalSalary, 0);
  const fmt = (n: number) => `₪ ${n.toLocaleString("en", { minimumFractionDigits: 2 })}`;

  const chartData = deptData.map(d => ({ name: d.dept, value: d.totalSalary }));

  const exportExcel = () => {
    if (!deptData.length) return;
    const rows = deptData.map(d => ({
      "القسم": d.dept,
      "عدد الموظفين": d.count,
      "إجمالي الرواتب": d.totalSalary,
      "النسبة %": totalCost ? ((d.totalSalary / totalCost) * 100).toFixed(1) : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تكلفة الموظفين");
    setNextExportBranding({ title: "تكلفة الموظفين" });
    XLSX.writeFile(wb, "تقرير_تكلفة_الموظفين.xlsx");
  };

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">تكلفة الموظفين حسب القسم</h1>
            <p className="text-xs text-muted-foreground">إجمالي: {fmt(totalCost)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!deptData.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="p-4">
          <ResponsiveContainer width="100%" height={280}>
            <RechartsPie>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
            </RechartsPie>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">عدد الموظفين</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">إجمالي الرواتب</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : !deptData.length ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">لا توجد بيانات موظفين</td></tr>
              ) : (
                <>
                  {deptData.map((d, i) => (
                    <tr key={d.dept} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium text-foreground flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {d.dept}
                      </td>
                      <td className="p-3">{d.count}</td>
                      <td className="p-3 font-bold">{fmt(d.totalSalary)}</td>
                      <td className="p-3">{totalCost ? ((d.totalSalary / totalCost) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="p-3">الإجمالي</td>
                    <td className="p-3">{employees?.length || 0}</td>
                    <td className="p-3">{fmt(totalCost)}</td>
                    <td className="p-3">100%</td>
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

export default HRStaffCostReport;
