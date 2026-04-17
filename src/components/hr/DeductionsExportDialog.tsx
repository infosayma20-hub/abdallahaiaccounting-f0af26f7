import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/hr-utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { setNextExportBranding } from "@/lib/excel-export";
interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  employees: { id: string; full_name: string; department: string; job_title: string }[];
}

const SOURCE_LABELS: Record<string, string> = {
  hr_advance: "سلفة HR",
  pos_meal: "وجبة POS",
  pos_sale_credit: "مبيعات POS",
  pos_shortage: "عجز صندوق",
  finance_manual: "يدوي",
  salary_deduction: "خصم تأديبي",
  insurance: "تأمين",
  tax: "ضريبة",
};

const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function DeductionsExportDialog({ open, onClose, userId, employees }: Props) {
  const now = new Date();
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1);
  const [fromYear, setFromYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);
  const [toYear, setToYear] = useState(now.getFullYear());
  const [scope, setScope] = useState<"all" | "employee" | "department">("all");
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [loading, setLoading] = useState(false);

  const [includeTypes, setIncludeTypes] = useState({
    pos_meal: true,
    hr_advance: true,
    pos_shortage: true,
    salary_deduction: true,
    finance_manual: true,
    pos_sale_credit: true,
  });

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];

  const handleExport = async () => {
    setLoading(true);
    try {
      const fromDate = `${fromYear}-${String(fromMonth).padStart(2, "0")}-01`;
      const toLastDay = new Date(toYear, toMonth, 0).getDate();
      const toDate = `${toYear}-${String(toMonth).padStart(2, "0")}-${toLastDay}`;

      const activeTypes = Object.entries(includeTypes).filter(([, v]) => v).map(([k]) => k);

      let query = supabase
        .from("employee_financial_movements")
        .select("*")
        .eq("user_id", userId)
        .eq("movement_type", "debit")
        .eq("status", "approved")
        .gte("movement_date", fromDate)
        .lte("movement_date", toDate)
        .in("source_type", activeTypes)
        .order("movement_date", { ascending: true });

      if (scope === "employee" && selectedEmpId) {
        query = query.eq("employee_id", selectedEmpId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info("لا توجد حركات في الفترة المحددة");
        setLoading(false);
        return;
      }

      // Build employee map
      const empMap: Record<string, { full_name: string; department: string; job_title: string }> = {};
      employees.forEach(e => { empMap[e.id] = e; });

      // Filter by department if needed
      let filtered = data as any[];
      if (scope === "department" && selectedDept) {
        const deptEmpIds = employees.filter(e => e.department === selectedDept).map(e => e.id);
        filtered = filtered.filter(m => deptEmpIds.includes(m.employee_id));
      }

      if (filtered.length === 0) {
        toast.info("لا توجد حركات مطابقة");
        setLoading(false);
        return;
      }

      const sumByType = (rows: any[], type: string) =>
        rows.filter(r => r.source_type === type).reduce((s: number, r: any) => s + Number(r.amount), 0);

      // Group by employee
      const grouped: Record<string, any[]> = {};
      filtered.forEach(m => {
        if (!grouped[m.employee_id]) grouped[m.employee_id] = [];
        grouped[m.employee_id].push(m);
      });

      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryData = Object.entries(grouped).map(([empId, rows]) => {
        const emp = empMap[empId] || { full_name: "غير معروف", department: "—", job_title: "—" };
        return {
          "الموظف": emp.full_name,
          "القسم": emp.department || "—",
          "المسمى الوظيفي": emp.job_title || "—",
          "سلف الرواتب": sumByType(rows, "hr_advance"),
          "مسحوبات POS": sumByType(rows, "pos_meal") + sumByType(rows, "pos_sale_credit"),
          "عجز الصناديق": sumByType(rows, "pos_shortage"),
          "خصومات تأديبية": sumByType(rows, "salary_deduction"),
          "مسحوبات يدوية": sumByType(rows, "finance_manual"),
          "إجمالي المسحوبات": rows.reduce((s: number, r: any) => s + Number(r.amount), 0),
        };
      });

      // Totals row
      const totalRow: any = { "الموظف": "الإجمالي الكلي" };
      ["سلف الرواتب", "مسحوبات POS", "عجز الصناديق", "خصومات تأديبية", "مسحوبات يدوية", "إجمالي المسحوبات"].forEach(key => {
        totalRow[key] = summaryData.reduce((s, r) => s + (r[key as keyof typeof r] as number || 0), 0);
      });
      summaryData.push(totalRow);

      const ws1 = XLSX.utils.json_to_sheet(summaryData);
      ws1["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws1, "ملخص المسحوبات");

      // Sheet 2: Details
      const detailData = filtered.map((row: any) => {
        const emp = empMap[row.employee_id];
        return {
          "التاريخ": row.movement_date,
          "الموظف": emp?.full_name || "—",
          "القسم": emp?.department || "—",
          "نوع المسحوب": SOURCE_LABELS[row.source_type] || row.source_type,
          "البيان": row.description,
          "المبلغ": Number(row.amount),
          "المرجع": row.source_reference || "—",
          "الحالة": "معتمد ✅",
        };
      });
      const ws2 = XLSX.utils.json_to_sheet(detailData);
      ws2["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws2, "تفاصيل الحركات");

      // Sheet 3: POS details
      const posData = filtered
        .filter((r: any) => ["pos_meal", "pos_sale_credit"].includes(r.source_type))
        .map((row: any) => ({
          "التاريخ": row.movement_date,
          "الموظف": empMap[row.employee_id]?.full_name || "—",
          "الصنف": row.description,
          "المبلغ": Number(row.amount),
          "رقم الفاتورة": row.source_reference || "—",
        }));

      if (posData.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(posData);
        ws3["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws3, "مسحوبات POS");
      }

      const fileName = `مسحوبات_الموظفين_${fromMonth}-${fromYear}_${toMonth}-${toYear}.xlsx`;
      setNextExportBranding({ title: "ملخص المسحوبات" });
      XLSX.writeFile(wb, fileName);
      toast.success("تم تصدير التقرير بنجاح");
      onClose();
    } catch (err: any) {
      toast.error("خطأ في التصدير: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const typeOptions = [
    { key: "pos_meal", label: "مسحوبات POS (وجبات)" },
    { key: "hr_advance", label: "سلف الرواتب" },
    { key: "pos_shortage", label: "عجز الصناديق" },
    { key: "salary_deduction", label: "خصومات تأديبية" },
    { key: "finance_manual", label: "مسحوبات يدوية" },
    { key: "pos_sale_credit", label: "مبيعات POS بالآجل" },
  ];

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> تصدير تقرير المسحوبات
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Period */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">الفترة</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex gap-1 items-center">
                <span className="text-xs text-muted-foreground">من:</span>
                <Select value={String(fromMonth)} onValueChange={v => setFromMonth(Number(v))}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <input type="number" className="w-16 h-8 text-xs border rounded px-1 bg-background" value={fromYear} onChange={e => setFromYear(Number(e.target.value))} />
              </div>
              <div className="flex gap-1 items-center">
                <span className="text-xs text-muted-foreground">إلى:</span>
                <Select value={String(toMonth)} onValueChange={v => setToMonth(Number(v))}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <input type="number" className="w-16 h-8 text-xs border rounded px-1 bg-background" value={toYear} onChange={e => setToYear(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">الموظفون</label>
            <div className="space-y-2">
              {[
                { value: "all", label: "كل الموظفين" },
                { value: "employee", label: "موظف محدد" },
                { value: "department", label: "قسم محدد" },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === opt.value}
                    onChange={() => setScope(opt.value as any)}
                    className="accent-primary"
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
              {scope === "employee" && (
                <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {scope === "department" && (
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر قسم" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Types */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">تضمين</label>
            <div className="space-y-1.5">
              {typeOptions.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeTypes[opt.key as keyof typeof includeTypes]}
                    onCheckedChange={(checked) =>
                      setIncludeTypes(prev => ({ ...prev, [opt.key]: !!checked }))
                    }
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
            <Button size="sm" onClick={handleExport} disabled={loading} className="gap-1">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              تصدير Excel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
