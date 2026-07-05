import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { FinanceShell } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, Search, Wallet, Users, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { toast } from "sonner";
import { multiWordMatchAny } from "@/lib/utils";

const AR_MONTHS = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

const fmt = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = {
  installment_id: string;
  loan_id: string;
  employee_id: string;
  employee_name: string;
  branch_name: string;
  job_title: string;
  month_number: number;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | string;
  paid_date: string | null;
  total_amount: number;
  total_months: number;
};

export default function LoansMonthlyPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["employee-loans-monthly", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("employee_loans")
        .select("id, total_amount, total_months, employees(id, full_name, job_title, branches(name)), loan_installments(id, month_number, due_date, installment_amount, status, paid_date)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const l of loans as any[]) {
      for (const i of l.loan_installments || []) {
        if (!i.due_date) continue;
        const d = new Date(i.due_date);
        if (d.getMonth() + 1 !== month || d.getFullYear() !== year) continue;
        out.push({
          installment_id: i.id,
          loan_id: l.id,
          employee_id: l.employees?.id,
          employee_name: l.employees?.full_name || "—",
          branch_name: l.employees?.branches?.name || "—",
          job_title: l.employees?.job_title || "",
          month_number: i.month_number,
          due_date: i.due_date,
          amount: Number(i.installment_amount || 0),
          status: i.status,
          paid_date: i.paid_date,
          total_amount: Number(l.total_amount || 0),
          total_months: Number(l.total_months || 0),
        });
      }
    }
    return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [loans, month, year]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q.trim() && !multiWordMatchAny(q, [r.employee_name, r.branch_name, r.job_title])) return false;
      return true;
    });
  }, [rows, statusFilter, q]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.amount, 0);
    const paid = filtered.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const pending = filtered.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0);
    const overdue = filtered
      .filter((r) => r.status === "pending" && new Date(r.due_date) < new Date())
      .reduce((s, r) => s + r.amount, 0);
    return { total, paid, pending, overdue, employees: new Set(filtered.map((r) => r.employee_id)).size };
  }, [filtered]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const l of loans as any[]) {
      for (const i of l.loan_installments || []) {
        if (i.due_date) set.add(new Date(i.due_date).getFullYear());
      }
    }
    set.add(now.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [loans]);

  const exportExcel = () => {
    if (!filtered.length) { toast.error("لا توجد بيانات للتصدير"); return; }
    const data = filtered.map((r) => ({
      "الموظف": r.employee_name,
      "الوظيفة": r.job_title,
      "الفرع": r.branch_name,
      "رقم القسط": r.month_number,
      "تاريخ الاستحقاق": r.due_date,
      "قيمة القسط": r.amount,
      "الحالة": r.status === "paid" ? "مدفوع" : r.status === "pending" ? "معلق" : r.status,
      "تاريخ الدفع": r.paid_date || "",
      "قيمة القرض": r.total_amount,
      "مدة القرض": r.total_months,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${AR_MONTHS[month - 1]} ${year}`);
    setNextExportBranding({ title: `الأقساط - ${AR_MONTHS[month - 1]} ${year}` });
    XLSX.writeFile(wb, `أقساط_${month}_${year}.xlsx`);
  };

  const handlePrint = () => {
    if (!filtered.length) { toast.error("لا توجد بيانات للطباعة"); return; }
    const companyName = company?.name || "الشركة";
    const companyLogo = company?.logo_url || "";
    const dateStr = new Date().toLocaleDateString("en-GB");
    const rowsHtml = filtered.map((r, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="font-weight:600">${r.employee_name}</td>
        <td>${r.branch_name}</td>
        <td style="text-align:center">${r.month_number}</td>
        <td style="text-align:center">${r.due_date}</td>
        <td style="text-align:left">${fmt(r.amount)}</td>
        <td style="text-align:center;color:${r.status === "paid" ? "#059669" : "#D97706"};font-weight:600">
          ${r.status === "paid" ? "✓ مدفوع" : "معلق"}
        </td>
        <td style="text-align:center">${r.paid_date || "—"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />
      <title>الأقساط الشهرية - ${AR_MONTHS[month - 1]} ${year}</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Tajawal', 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #1a1a1a; direction: rtl; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
        thead tr { background: #1B3A5C; color: #fff; }
        tbody tr:nth-child(even) { background: #fafbfc; }
      </style></head><body>
      <div style="background:#1B3A5C;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:20px;font-weight:700">الأقساط المستحقة</div>
          <div style="font-size:12px;opacity:.7;margin-top:2px">${AR_MONTHS[month - 1]} ${year}</div>
        </div>
        <div style="text-align:left;display:flex;align-items:center;gap:12px">
          ${companyLogo ? `<img src="${companyLogo}" style="height:40px;border-radius:6px" />` : ""}
          <div style="font-size:15px;font-weight:700">${companyName}</div>
        </div>
      </div>
      <div style="height:3px;background:#4A9EE8"></div>
      <div style="padding:14px 28px;display:flex;justify-content:space-between;font-size:11px;color:#6B7280;border-bottom:1px solid #eee">
        <span>تاريخ الطباعة: <strong style="color:#1a1a1a">${dateStr}</strong></span>
        <span>عدد الأقساط: <strong style="color:#1a1a1a">${filtered.length}</strong></span>
        <span>عدد الموظفين: <strong style="color:#1a1a1a">${totals.employees}</strong></span>
        <span>الإجمالي: <strong style="color:#1a1a1a">${fmt(totals.total)} ₪</strong></span>
      </div>
      <div style="padding:20px 28px">
        <table>
          <thead><tr>
            <th style="text-align:center">#</th>
            <th>الموظف</th>
            <th>الفرع</th>
            <th style="text-align:center">القسط</th>
            <th style="text-align:center">تاريخ الاستحقاق</th>
            <th style="text-align:left">القيمة</th>
            <th style="text-align:center">الحالة</th>
            <th style="text-align:center">تاريخ الدفع</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr style="background:#1B3A5C;color:#fff;font-weight:700">
            <td colspan="5" style="padding:8px">الإجمالي</td>
            <td style="text-align:left;padding:8px">${fmt(totals.total)}</td>
            <td colspan="2"></td>
          </tr></tfoot>
        </table>
      </div>
      <div style="background:#f7f8fa;padding:10px 28px;display:flex;justify-content:space-between;font-size:10px;color:#6B7280;border-top:1px solid #eee;margin-top:20px">
        <span>طُبع بتاريخ ${dateStr}</span>
        <span style="color:#4A9EE8;font-weight:600">${companyName}</span>
      </div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <FinanceShell
      title="الأقساط الشهرية للقروض"
      subtitle={`عرض الأقساط المستحقة لكل شهر — ${AR_MONTHS[month - 1]} ${year}`}
      breadcrumb={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "القروض الحسنة", href: "/loans" },
        { label: "الأقساط الشهرية" },
      ]}
      rightSlot={
        <>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!filtered.length}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </>
      }
    >
      <div className="space-y-4" dir="rtl">
        {/* Filter bar */}
        <Card className="p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">الشهر</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-[140px] text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AR_MONTHS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">السنة</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[110px] text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[130px] text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="paid">مدفوع</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] text-muted-foreground block mb-1">بحث</label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="الموظف / الفرع / الوظيفة"
                className="h-8 pr-7 text-[12.5px]"
              />
            </div>
          </div>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground">إجمالي الأقساط</span>
            </div>
            <p className="text-sm font-bold tabular-nums">₪ {fmt(totals.total)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground">المدفوع</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-emerald-600">₪ {fmt(totals.paid)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-[10px] text-muted-foreground">المعلق</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-amber-600">₪ {fmt(totals.pending)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span className="text-[10px] text-muted-foreground">متأخر</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-rose-600">₪ {fmt(totals.overdue)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground">عدد الموظفين</span>
            </div>
            <p className="text-sm font-bold tabular-nums">{totals.employees}</p>
          </Card>
        </div>

        {/* Grid */}
        <Card className="overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-380px)]">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/60 sticky top-0 z-10">
                <tr className="text-right">
                  <th className="px-3 py-2 font-semibold w-10 text-center">#</th>
                  <th className="px-3 py-2 font-semibold">الموظف</th>
                  <th className="px-3 py-2 font-semibold">الفرع</th>
                  <th className="px-3 py-2 font-semibold text-center">رقم القسط</th>
                  <th className="px-3 py-2 font-semibold text-center">تاريخ الاستحقاق</th>
                  <th className="px-3 py-2 font-semibold text-left">قيمة القسط</th>
                  <th className="px-3 py-2 font-semibold text-center">الحالة</th>
                  <th className="px-3 py-2 font-semibold text-center">تاريخ الدفع</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد أقساط لهذا الشهر</td></tr>
                ) : (
                  filtered.map((r, i) => {
                    const overdue = r.status === "pending" && new Date(r.due_date) < new Date();
                    return (
                      <tr key={r.installment_id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.branch_name}</td>
                        <td className="px-3 py-2 text-center">{r.month_number} / {r.total_months}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{r.due_date}</td>
                        <td className="px-3 py-2 text-left font-semibold tabular-nums">₪ {fmt(r.amount)}</td>
                        <td className="px-3 py-2 text-center">
                          {r.status === "paid" ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">مدفوع</Badge>
                          ) : overdue ? (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30">متأخر</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">معلق</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">{r.paid_date || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/60 font-bold">
                    <td colSpan={5} className="px-3 py-2 text-right">الإجمالي</td>
                    <td className="px-3 py-2 text-left tabular-nums">₪ {fmt(totals.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </FinanceShell>
  );
}