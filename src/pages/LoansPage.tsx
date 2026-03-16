import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, Wallet, Users, Calendar, CheckCircle2, Clock, ChevronDown, ChevronUp, Plus, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const fmtCurrency = (v: number) => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;

interface Employee {
  id: string;
  full_name: string;
  department: string | null;
}

export default function LoansPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 ml-1" /> قرض جديد
          </Button>
        </div>
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

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{loan.paid_months} من {loan.total_months} قسط</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

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

      {/* Add Loan Dialog */}
      <AddLoanDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        userId={user?.id || ""}
        companyId={company?.id || null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["employee-loans"] });
          setShowAddDialog(false);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────
// Add Loan Dialog
// ─────────────────────────────────────────────────
function AddLoanDialog({ open, onOpenChange, userId, companyId, onSuccess }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  companyId: string | null;
  onSuccess: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [showEmpDrop, setShowEmpDrop] = useState(false);

  const [totalAmount, setTotalAmount] = useState("");
  const [monthlyInstallment, setMonthlyInstallment] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Cash boxes
  const [cashBoxes, setCashBoxes] = useState<{ id: string; name: string; gl_account_code: string | null }[]>([]);
  const [selectedCashBox, setSelectedCashBox] = useState("");

  // Derived
  const amount = parseFloat(totalAmount) || 0;
  const installment = parseFloat(monthlyInstallment) || 0;
  const totalMonths = installment > 0 ? Math.ceil(amount / installment) : 0;
  const lastInstallment = installment > 0 && totalMonths > 0 ? amount - installment * (totalMonths - 1) : 0;

  // Generate schedule preview
  const schedule = useMemo(() => {
    if (!amount || !installment || !firstPaymentDate) return [];
    const items = [];
    let balance = amount;
    const startDate = new Date(firstPaymentDate);

    for (let i = 0; i < totalMonths; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      const inst = i === totalMonths - 1 ? lastInstallment : installment;
      balance -= inst;
      items.push({
        month_number: i + 1,
        due_date: dueDate.toISOString().split("T")[0],
        installment_amount: Math.round(inst * 100) / 100,
        balance_after: Math.max(0, Math.round(balance * 100) / 100),
      });
    }
    return items;
  }, [amount, installment, totalMonths, lastInstallment, firstPaymentDate]);

  const lastPaymentDate = schedule.length > 0 ? schedule[schedule.length - 1].due_date : firstPaymentDate;

  // Load employees & cash boxes
  useEffect(() => {
    if (!userId || !open) return;
    Promise.all([
      supabase.from("employees").select("id, full_name, department").eq("user_id", userId).eq("is_active", true).order("full_name"),
      supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", userId).eq("is_active", true),
    ]).then(([empRes, cbRes]) => {
      setEmployees(empRes.data || []);
      const boxes = cbRes.data || [];
      setCashBoxes(boxes);
      if (boxes.length && !selectedCashBox) setSelectedCashBox(boxes[0].id);
    });
  }, [userId, open]);

  const filteredEmps = useMemo(() => {
    if (!empSearch.trim()) return employees.slice(0, 10);
    const q = empSearch.toLowerCase();
    return employees.filter(e => e.full_name.toLowerCase().includes(q)).slice(0, 10);
  }, [employees, empSearch]);

  const resetForm = () => {
    setSelectedEmp(null);
    setEmpSearch("");
    setTotalAmount("");
    setMonthlyInstallment("");
    setFirstPaymentDate(new Date().toISOString().split("T")[0]);
    setNotes("");
  };

  const handleSave = async () => {
    if (!selectedEmp || amount <= 0 || installment <= 0 || !firstPaymentDate) {
      toast.error("الرجاء تعبئة جميع الحقول المطلوبة");
      return;
    }
    if (installment > amount) {
      toast.error("القسط الشهري لا يمكن أن يتجاوز مبلغ القرض");
      return;
    }

    setSaving(true);
    try {
      // 1. Find or create employee account under 1180
      let empAccountCode = "";
      const { data: existingAcc } = await supabase
        .from("accounts")
        .select("account_code")
        .eq("user_id", userId)
        .eq("parent_code", "1180")
        .ilike("account_name", `%${selectedEmp.full_name}%`)
        .limit(1)
        .maybeSingle();

      if (existingAcc) {
        empAccountCode = existingAcc.account_code;
      } else {
        // Get next available code under 1180
        const { data: siblings } = await supabase
          .from("accounts")
          .select("account_code")
          .eq("user_id", userId)
          .eq("parent_code", "1180")
          .order("account_code", { ascending: false })
          .limit(1);

        const lastCode = siblings?.[0]?.account_code || "1180";
        const nextNum = parseInt(lastCode) + 1;
        empAccountCode = String(nextNum);

        await supabase.from("accounts").insert({
          user_id: userId,
          account_code: empAccountCode,
          account_name: `ذمم ${selectedEmp.full_name}`,
          account_type: "asset",
          parent_code: "1180",
          is_active: true,
          is_system: false,
        });
      }

      // 2. Create loan record
      const { data: loanRecord, error: loanErr } = await supabase
        .from("employee_loans")
        .insert({
          user_id: userId,
          company_id: companyId,
          employee_id: selectedEmp.id,
          total_amount: amount,
          monthly_installment: installment,
          total_months: totalMonths,
          paid_months: 0,
          remaining_amount: amount,
          first_payment_date: firstPaymentDate,
          last_payment_date: lastPaymentDate,
          status: "active",
          notes: notes || `قرض حسن - ${selectedEmp.full_name}`,
        })
        .select()
        .single();

      if (loanErr) throw loanErr;

      // 3. Create installment schedule
      const installments = schedule.map(inst => ({
        loan_id: loanRecord.id,
        user_id: userId,
        company_id: companyId,
        employee_id: selectedEmp.id,
        month_number: inst.month_number,
        due_date: inst.due_date,
        installment_amount: inst.installment_amount,
        balance_after: inst.balance_after,
        status: "pending",
      }));

      const { error: instErr } = await supabase
        .from("loan_installments")
        .insert(installments);

      if (instErr) throw instErr;

      // 4. Create accounting entry: Debit employee account (1180.x), Credit cash (1110)
      //    This records the loan disbursement
      const idempotencyKey = `LOAN-${loanRecord.id}`;
      const { error: txErr } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          transaction_date: firstPaymentDate,
          description: `قرض حسن - ${selectedEmp.full_name} - مبلغ ${fmtCurrency(amount)}`,
          debit_account_code: empAccountCode,
          credit_account_code: "1110", // Cash
          amount: amount,
          currency: "شيكل",
          transaction_type: "loan_disbursement",
          reference: `LOAN-${loanRecord.id.slice(0, 8)}`,
          payment_method: "نقدي",
          idempotency_key: idempotencyKey,
        });

      if (txErr) throw txErr;

      toast.success(`تم إنشاء قرض حسن لـ ${selectedEmp.full_name} بنجاح`);
      resetForm();
      onSuccess();
    } catch (err: any) {
      console.error("Loan creation error:", err);
      toast.error(err.message || "حدث خطأ أثناء إنشاء القرض");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wallet className="h-5 w-5 text-primary" />
            قرض حسن جديد
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Employee Selection */}
          <div className="relative">
            <Label className="text-xs mb-1.5 block">الموظف *</Label>
            <div className="relative">
              <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={selectedEmp ? selectedEmp.full_name : empSearch}
                onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(null); setShowEmpDrop(true); }}
                onFocus={() => setShowEmpDrop(true)}
                placeholder="ابحث عن موظف..."
                className="pr-9"
              />
            </div>
            {showEmpDrop && !selectedEmp && (
              <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredEmps.map(emp => (
                  <button key={emp.id} onClick={() => { setSelectedEmp(emp); setEmpSearch(""); setShowEmpDrop(false); }}
                    className="w-full text-right px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between">
                    <span className="text-sm">{emp.full_name}</span>
                    <span className="text-xs text-muted-foreground">{emp.department || ""}</span>
                  </button>
                ))}
                {filteredEmps.length === 0 && <p className="text-center py-3 text-xs text-muted-foreground">لا توجد نتائج</p>}
              </div>
            )}
          </div>

          {selectedEmp && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs">
              <span className="text-muted-foreground">الموظف: </span>
              <span className="font-bold text-foreground">{selectedEmp.full_name}</span>
              {selectedEmp.department && <span className="text-muted-foreground mr-2">({selectedEmp.department})</span>}
            </div>
          )}

          {/* Loan Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">مبلغ القرض *</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  className="pr-8 text-left font-mono"
                  placeholder="0.00"
                  min="0"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">القسط الشهري *</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={monthlyInstallment}
                  onChange={e => setMonthlyInstallment(e.target.value)}
                  className="pr-8 text-left font-mono"
                  placeholder="0.00"
                  min="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">تاريخ أول قسط *</Label>
              <Input type="date" value={firstPaymentDate} onChange={e => setFirstPaymentDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">عدد الأقساط</Label>
              <Input value={totalMonths || "-"} readOnly className="bg-muted/30 font-bold text-center" />
            </div>
          </div>

          {/* Derived Info */}
          {amount > 0 && installment > 0 && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">إجمالي القرض</p>
                <p className="font-bold text-foreground">{fmtCurrency(amount)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">آخر قسط</p>
                <p className="font-bold text-foreground">{fmtCurrency(lastInstallment)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">تاريخ الانتهاء</p>
                <p className="font-bold text-foreground">{lastPaymentDate}</p>
              </div>
            </div>
          )}

          {/* Schedule Preview */}
          {schedule.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                معاينة جدول الأقساط ({schedule.length} قسط)
              </div>
              <div className="max-h-48 overflow-y-auto">
                {schedule.map((inst, idx) => (
                  <div key={idx} className={`flex items-center justify-between px-3 py-2 text-xs ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{inst.month_number}</span>
                      <span className="text-muted-foreground">{inst.due_date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{fmtCurrency(inst.installment_amount)}</span>
                      <span className="text-[10px] text-muted-foreground">رصيد: {fmtCurrency(inst.balance_after)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..." rows={2} />
          </div>

          {/* Accounting Info */}
          {selectedEmp && amount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-blue-700 dark:text-blue-400">📋 القيد المحاسبي الذي سيتم إنشاؤه:</p>
              <div className="flex justify-between">
                <span>مدين: ذمم {selectedEmp.full_name} (1180.x)</span>
                <span className="font-mono font-bold">{fmtCurrency(amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>دائن: الصندوق (1110)</span>
                <span className="font-mono font-bold">{fmtCurrency(amount)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving || !selectedEmp || amount <= 0 || installment <= 0}>
              {saving ? "جاري الحفظ..." : "إنشاء القرض"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
