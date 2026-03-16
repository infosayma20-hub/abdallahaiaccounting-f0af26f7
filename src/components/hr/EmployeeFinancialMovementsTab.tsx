import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/hr-utils";

interface Props {
  employeeId: string;
  employeeName: string;
  userId: string;
}

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

interface FinancialRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  source: string;
  category: "salary" | "deduction" | "installment";
}

export default function EmployeeFinancialMovementsTab({ employeeId, employeeName, userId }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filter, setFilter] = useState("الكل");
  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, [employeeId, month, year]);

  const fetchAll = async () => {
    setLoading(true);
    const allRows: FinancialRow[] = [];

    // 1. Payroll
    const { data: payroll } = await supabase
      .from("employee_payroll")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .eq("period_month", month)
      .eq("period_year", year);

    (payroll || []).forEach((p: any) => {
      allRows.push({
        id: "pay-" + p.id,
        date: p.paid_date || `${year}-${String(month).padStart(2, "0")}-28`,
        description: `راتب شهر ${monthNames[month - 1]} ${year}`,
        amount: Number(p.net_salary),
        status: p.is_paid ? "مدفوع" : "معلق",
        source: "مسير الرواتب",
        category: "salary",
      });
    });

    // 2. Deductions (employee_deductions)
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
    const { data: deductions } = await supabase
      .from("employee_deductions")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .gte("deduction_date", startDate)
      .lte("deduction_date", endDate);

    (deductions || []).forEach((d: any) => {
      allRows.push({
        id: "ded-" + d.id,
        date: d.deduction_date,
        description: d.description || d.deduction_type,
        amount: Number(d.amount),
        status: d.status || (d.is_repaid ? "تم الاستقطاع" : "معتمد للخصم"),
        source: d.deduction_type,
        category: "deduction",
      });
    });

    // 3. Financial movements
    const { data: movements } = await supabase
      .from("employee_financial_movements")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .eq("salary_month", month)
      .eq("salary_year", year);

    (movements || []).forEach((m: any) => {
      allRows.push({
        id: "mov-" + m.id,
        date: m.movement_date,
        description: m.description,
        amount: Number(m.amount),
        status: m.status === "approved" ? "معتمد" : m.status === "deducted" ? "تم الاستقطاع" : "قيد المراجعة",
        source: m.source_type,
        category: "deduction",
      });
    });

    // 4. Advance installments
    const dueMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const { data: installments } = await supabase
      .from("employee_advance_installments")
      .select("*, employee_advances(advance_type, amount)")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .eq("due_month", dueMonth);

    (installments || []).forEach((inst: any) => {
      const adv = inst.employee_advances;
      const typeLabel = adv?.advance_type === "قرض_حسن" ? "قسط قرض" : "قسط سلفة";
      allRows.push({
        id: "inst-" + inst.id,
        date: inst.due_month,
        description: `${typeLabel} (${inst.installment_number})`,
        amount: Number(inst.amount),
        status: inst.status === "deducted" ? "تم الاستقطاع" : "معلق",
        source: "قسط قرض",
        category: "installment",
      });
    });

    allRows.sort((a, b) => b.date.localeCompare(a.date));
    setRows(allRows);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (filter === "الكل") return rows;
    if (filter === "رواتب") return rows.filter(r => r.category === "salary");
    if (filter === "مسحوبات") return rows.filter(r => r.category === "deduction");
    if (filter === "أقساط") return rows.filter(r => r.category === "installment");
    return rows;
  }, [rows, filter]);

  const totalSalaries = rows.filter(r => r.category === "salary").reduce((s, r) => s + r.amount, 0);
  const totalDeductions = rows.filter(r => r.category === "deduction").reduce((s, r) => s + r.amount, 0);
  const totalInstallments = rows.filter(r => r.category === "installment").reduce((s, r) => s + r.amount, 0);

  const statusBadge = (status: string) => {
    if (status === "مدفوع" || status === "تم الاستقطاع" || status === "معتمد") return <Badge variant="default" className="text-[10px]">{status}</Badge>;
    if (status === "معلق" || status === "قيد المراجعة") return <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{status}</Badge>;
    if (status === "معتمد للخصم") return <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">{status}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">كشف الحركات المالية — {employeeName}</h3>
        <div className="flex gap-2 items-center">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthNames.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" className="w-20 h-8 text-xs" value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">إجمالي الرواتب</p>
          <p className="text-sm font-bold text-primary">{formatCurrency(totalSalaries)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">إجمالي المسحوبات</p>
          <p className="text-sm font-bold text-destructive">{formatCurrency(totalDeductions)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">إجمالي الأقساط</p>
          <p className="text-sm font-bold text-amber-600">{formatCurrency(totalInstallments)}</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["الكل", "رواتب", "مسحوبات", "أقساط"].map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="text-xs h-7" onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">البيان</TableHead>
            <TableHead className="text-right">المصدر</TableHead>
            <TableHead className="text-right">المبلغ</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">جاري التحميل...</TableCell></TableRow>
          ) : filtered.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا توجد حركات لهذا الشهر</TableCell></TableRow>
          ) : (
            filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.date}</TableCell>
                <TableCell className="text-xs">{r.description}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{r.source}</Badge></TableCell>
                <TableCell className={`font-medium text-xs ${r.category === "salary" ? "text-emerald-600" : "text-destructive"}`}>
                  {r.category === "salary" ? "+" : "-"}{formatCurrency(r.amount)}
                </TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
