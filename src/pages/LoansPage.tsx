import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, Wallet, Users, Calendar, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";

const fmtCurrency = (v: number) => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;

export default function LoansPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["employee-loans", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("employee_loans")
        .select("*, employees(full_name, department), loan_installments(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (statusFilter === "الكل") return loans;
    if (statusFilter === "active") return loans.filter((l: any) => l.status === "active");
    if (statusFilter === "completed") return loans.filter((l: any) => l.status === "completed");
    return loans;
  }, [loans, statusFilter]);

  const totalActive = useMemo(() =>
    loans.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.remaining_amount), 0)
  , [loans]);

  const totalOriginal = useMemo(() =>
    loans.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.total_amount), 0)
  , [loans]);

  const thisMonthDue = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    return loans.reduce((sum: number, l: any) => {
      const inst = (l.loan_installments || []).find((i: any) => {
        const d = new Date(i.due_date);
        return d.getMonth() + 1 === m && d.getFullYear() === y && i.status === "pending";
      });
      return sum + (inst ? Number(inst.installment_amount) : 0);
    }, 0);
  }, [loans]);

  const activeCount = loans.filter((l: any) => l.status === "active").length;

  const exportExcel = () => {
    const rows = filtered.map((l: any) => ({
      "الموظف": l.employees?.full_name || "-",
      "المبلغ الإجمالي": Number(l.total_amount),
      "القسط الشهري": Number(l.monthly_installment),
      "الأقساط المدفوعة": l.paid_months,
      "إجمالي الأقساط": l.total_months,
      "المتبقي": Number(l.remaining_amount),
      "الحالة": l.status === "active" ? "نشط" : "مكتمل",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "القروض");
    XLSX.writeFile(wb, "قروض_الموظفين.xlsx");
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">القروض الحسنة</h1>
            <p className="text-xs text-muted-foreground">إدارة قروض الموظفين وجداول السداد</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">إجمالي القروض النشطة</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(totalOriginal)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] text-muted-foreground">المتبقي للسداد</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(totalActive)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] text-muted-foreground">مستحق هذا الشهر</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(thisMonthDue)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground">عدد القروض النشطة</span>
          </div>
          <p className="text-sm font-bold text-foreground">{activeCount}</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="الكل">الكل</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loan Cards */}
      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">جاري التحميل...</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا توجد قروض</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((loan: any) => {
            const progress = loan.total_months > 0 ? (loan.paid_months / loan.total_months) * 100 : 0;
            const isExpanded = expandedLoan === loan.id;
            const installments = (loan.loan_installments || []).sort((a: any, b: any) => a.month_number - b.month_number);

            return (
              <Card key={loan.id} className="overflow-hidden">
                {/* Loan Summary */}
                <div
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-foreground">{loan.employees?.full_name || "-"}</span>
                        <Badge variant={loan.status === "active" ? "default" : "secondary"} className={`text-[10px] ${loan.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {loan.status === "active" ? "نشط" : "مكتمل"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{loan.employees?.department || "-"}</span>
                      </div>
                    </div>
                    <div className="text-left flex items-center gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">{fmtCurrency(Number(loan.remaining_amount))}</p>
                        <p className="text-[10px] text-muted-foreground">متبقي من {fmtCurrency(Number(loan.total_amount))}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{loan.paid_months} من {loan.total_months} قسط</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Quick Info */}
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="bg-muted/40 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">القسط الشهري</p>
                      <p className="font-semibold text-foreground">{fmtCurrency(Number(loan.monthly_installment))}</p>
                    </div>
                    <div className="bg-muted/40 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">بداية السداد</p>
                      <p className="font-semibold text-foreground">{loan.first_payment_date}</p>
                    </div>
                    <div className="bg-muted/40 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">نهاية السداد</p>
                      <p className="font-semibold text-foreground">{loan.last_payment_date}</p>
                    </div>
                  </div>
                </div>

                {/* Expanded: Installment Schedule */}
                {isExpanded && installments.length > 0 && (
                  <div className="border-t border-border">
                    <div className="p-3 bg-muted/20">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">جدول الأقساط</h4>
                      <div className="space-y-1.5">
                        {installments.map((inst: any) => (
                          <div key={inst.id} className={`flex items-center justify-between p-2 rounded text-xs ${inst.status === "paid" ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-background"}`}>
                            <div className="flex items-center gap-2">
                              {inst.status === "paid" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className="text-muted-foreground">قسط {inst.month_number}</span>
                              <span className="text-muted-foreground">{inst.due_date}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-foreground">{fmtCurrency(Number(inst.installment_amount))}</span>
                              <span className="text-[10px] text-muted-foreground">رصيد: {fmtCurrency(Number(inst.balance_after))}</span>
                              <Badge variant={inst.status === "paid" ? "default" : "outline"} className={`text-[9px] ${inst.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}`}>
                                {inst.status === "paid" ? "مدفوع" : "معلق"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {loan.notes && (
                      <div className="px-3 pb-3 text-xs text-muted-foreground">
                        📝 {loan.notes}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
