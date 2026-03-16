import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Banknote, ChevronDown, ChevronUp, ExternalLink, Trash2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/hr-utils";
import AdvanceRequestModal from "./AdvanceRequestModal";
import { useNavigate } from "react-router-dom";

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DEDUCTION_TYPES = ["أكل", "مشتريات", "مخالفات", "توصيل", "عجز", "فائض", "غياب", "أخرى"];

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل", "نقدي": "نقدي", "شيك": "شيك", "تحويل": "تحويل", "بطاقة": "بطاقة" };
const STATUS_LABELS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغي" };

interface Props {
  employeeId: string;
  employeeName: string;
  userId: string;
  deductions: any[];
  onRefresh: () => void;
}

export default function EmployeeDeductionsTab({ employeeId, employeeName, userId, deductions, onRefresh }: Props) {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [form, setForm] = useState({
    deduction_type: "أكل",
    amount: 0,
    description: "",
    deduction_date: new Date().toISOString().split("T")[0],
    deduction_month: "",
  });

  const [advances, setAdvances] = useState<any[]>([]);
  const [expandedAdvance, setExpandedAdvance] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Record<string, any[]>>({});

  // Payment vouchers for employee
  const [paymentVouchers, setPaymentVouchers] = useState<any[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [deleteVoucherId, setDeleteVoucherId] = useState<string | null>(null);
  const [deletingVoucher, setDeletingVoucher] = useState(false);

  useEffect(() => {
    fetchAdvances();
    fetchPaymentVouchers();
  }, [employeeId, employeeName]);

  async function fetchPaymentVouchers() {
    setLoadingVouchers(true);
    try {
      // Normalize name for search
      const nameVariants = [employeeName];
      const normalized = employeeName.replace(/\s+/g, " ").trim();
      if (!nameVariants.includes(normalized)) nameVariants.push(normalized);
      // Also handle عبدالله vs عبد الله
      const altName = normalized.replace(/عبدالله/g, "عبد الله");
      if (!nameVariants.includes(altName)) nameVariants.push(altName);
      const altName2 = normalized.replace(/عبد الله/g, "عبدالله");
      if (!nameVariants.includes(altName2)) nameVariants.push(altName2);

      // Fetch vouchers where description contains employee name
      let allVouchers: any[] = [];
      for (const name of nameVariants) {
        const { data } = await supabase
          .from("vouchers")
          .select("*")
          .eq("user_id", userId)
          .eq("type", "payment")
          .neq("status", "cancelled")
          .ilike("description", `%${name}%`)
          .order("date", { ascending: false });
        if (data) allVouchers.push(...data);
      }

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = allVouchers.filter(v => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });

      setPaymentVouchers(unique);
    } catch (err) {
      console.error("Error fetching payment vouchers:", err);
    } finally {
      setLoadingVouchers(false);
    }
  }

  async function handleDeleteVoucher() {
    if (!deleteVoucherId) return;
    setDeletingVoucher(true);
    try {
      const voucher = paymentVouchers.find(v => v.id === deleteVoucherId);
      
      // Soft-delete linked transaction
      if (voucher?.linked_transaction_id) {
        await supabase.from("transactions")
          .update({ is_deleted: true })
          .eq("id", voucher.linked_transaction_id);
      }

      // Cancel the voucher
      await supabase.from("vouchers")
        .update({ status: "cancelled" })
        .eq("id", deleteVoucherId);

      toast.success("تم إلغاء السند بنجاح");
      setDeleteVoucherId(null);
      fetchPaymentVouchers();
      onRefresh();
    } catch (err) {
      toast.error("حدث خطأ أثناء الإلغاء");
    } finally {
      setDeletingVoucher(false);
    }
  }

  async function fetchAdvances() {
    const { data } = await supabase
      .from("employee_advances")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setAdvances((data as any[]) || []);
  }

  async function fetchInstallments(advanceId: string) {
    if (installments[advanceId]) {
      setExpandedAdvance(expandedAdvance === advanceId ? null : advanceId);
      return;
    }
    const { data } = await supabase
      .from("employee_advance_installments")
      .select("*")
      .eq("advance_id", advanceId)
      .order("installment_number");
    setInstallments(prev => ({ ...prev, [advanceId]: (data as any[]) || [] }));
    setExpandedAdvance(advanceId);
  }

  const handleAdd = async () => {
    if (form.amount <= 0) { toast.error("المبلغ مطلوب"); return; }
    const { error } = await supabase.from("employee_deductions").insert({
      employee_id: employeeId,
      user_id: userId,
      deduction_type: form.deduction_type,
      amount: form.amount,
      description: form.description,
      deduction_date: form.deduction_date,
      deduction_month: form.deduction_month || null,
      status: "معتمد للخصم",
    } as any);
    if (error) toast.error("خطأ في الإضافة");
    else {
      toast.success("تمت الإضافة");
      setShowForm(false);
      setForm({ deduction_type: "أكل", amount: 0, description: "", deduction_date: new Date().toISOString().split("T")[0], deduction_month: "" });
      onRefresh();
    }
  };

  const statusBadge = (d: any) => {
    const st = d.status || (d.is_repaid ? "تم الاستقطاع" : "معتمد للخصم");
    if (st === "تم الاستقطاع") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{st}</Badge>;
    if (st === "معتمد للخصم") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{st}</Badge>;
    if (st === "ملغى") return <Badge variant="destructive" className="text-[10px]">{st}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{st}</Badge>;
  };

  const voucherStatusBadge = (status: string) => {
    const label = STATUS_LABELS[status] || status;
    if (status === "posted") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{label}</Badge>;
    if (status === "draft") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{label}</Badge>;
    if (status === "cancelled") return <Badge variant="destructive" className="text-[10px]">{label}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
  };

  // Extract category from description like "سلفة - عبد الله صايمة" → "سلفة"
  const extractCategory = (desc: string) => {
    const parts = desc.split(" - ");
    return parts.length > 1 ? parts[0].trim() : "—";
  };

  const activeAdvances = advances.filter(a => a.status !== "fully_paid" && a.status !== "rejected");

  const totalVoucherAmount = paymentVouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Payment Vouchers Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            سندات الصرف ({paymentVouchers.length})
          </h4>
          <Badge variant="outline" className="text-xs">
            الإجمالي: {formatCurrency(totalVoucherAmount)}
          </Badge>
        </div>

        {loadingVouchers ? (
          <div className="text-center py-4 text-muted-foreground text-xs">جاري التحميل...</div>
        ) : paymentVouchers.length === 0 ? (
          <Card className="p-4 text-center text-muted-foreground text-xs">
            لا توجد سندات صرف مسجلة لهذا الموظف
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right text-xs font-semibold">رقم السند</TableHead>
                  <TableHead className="text-right text-xs font-semibold">التاريخ</TableHead>
                  <TableHead className="text-right text-xs font-semibold">التصنيف</TableHead>
                  <TableHead className="text-right text-xs font-semibold">البيان</TableHead>
                  <TableHead className="text-right text-xs font-semibold">طريقة الدفع</TableHead>
                  <TableHead className="text-right text-xs font-semibold">المبلغ</TableHead>
                  <TableHead className="text-right text-xs font-semibold">الحالة</TableHead>
                  <TableHead className="text-right text-xs font-semibold">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentVouchers.map(v => (
                  <TableRow key={v.id} className="hover:bg-muted/30">
                    <TableCell>
                      <button
                        onClick={() => navigate(`/finance/voucher/payment?edit=${v.id}`)}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        {v.ref_number}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">{v.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {extractCategory(v.description || "")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[180px]" title={v.description}>
                      {v.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {PAYMENT_LABELS[v.payment_method] || v.payment_method || "—"}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-destructive">
                      {formatCurrency(Number(v.amount || 0))}
                    </TableCell>
                    <TableCell>{voucherStatusBadge(v.status || "posted")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="تعديل السند"
                          onClick={() => navigate(`/finance/voucher/payment?edit=${v.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="إلغاء السند"
                          onClick={() => setDeleteVoucherId(v.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Active Advances Section */}
      {activeAdvances.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-foreground">السلف والقروض النشطة</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">القسط/شهر</TableHead>
                <TableHead className="text-right">المسدَّد</TableHead>
                <TableHead className="text-right">المتبقي</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">تفاصيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeAdvances.map(a => {
                const insts = installments[a.id] || [];
                const paid = insts.filter((i: any) => i.status === "deducted").reduce((s: number, i: any) => s + Number(i.amount), 0);
                const remaining = Number(a.amount) - paid;
                return (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => fetchInstallments(a.id)}>
                    <TableCell className="text-xs">{a.advance_type === "قرض_حسن" ? "🤝 قرض حسن" : "💵 سلفة"}</TableCell>
                    <TableCell className="text-xs font-medium">{formatCurrency(Number(a.amount))}</TableCell>
                    <TableCell className="text-xs">{formatCurrency(Number(a.installment_amount))}</TableCell>
                    <TableCell className="text-xs text-emerald-600">{formatCurrency(paid)}</TableCell>
                    <TableCell className="text-xs text-destructive">{formatCurrency(remaining)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{a.status === "approved" ? "نشط" : a.status}</Badge></TableCell>
                    <TableCell>
                      {expandedAdvance === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Expanded installments */}
          {expandedAdvance && installments[expandedAdvance] && (
            <Card className="p-3 mr-4 bg-muted/20">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">الشهر</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments[expandedAdvance].map((inst: any) => (
                    <TableRow key={inst.id}>
                      <TableCell className="text-xs">{inst.installment_number}</TableCell>
                      <TableCell className="text-xs">{inst.due_month}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(Number(inst.amount))}</TableCell>
                      <TableCell>
                        {inst.status === "deducted" ? (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✅ مستقطع</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">⏳ معلق</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Deductions */}
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm text-foreground">المسحوبات والخصومات</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAdvanceModal(true)} className="gap-1 text-xs">
            <Banknote className="h-3 w-3" /> طلب سلفة / قرض
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1 text-xs">
            <Plus className="h-3 w-3" /> إضافة خصم
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">البيان/السبب</TableHead>
            <TableHead className="text-right">المبلغ</TableHead>
            <TableHead className="text-right">تاريخ الإضافة</TableHead>
            <TableHead className="text-right">شهر الاستقطاع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deductions.map(d => (
            <TableRow key={d.id}>
              <TableCell>{statusBadge(d)}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px]">{d.deduction_type}</Badge></TableCell>
              <TableCell className="text-xs truncate max-w-[150px]">{d.description || "—"}</TableCell>
              <TableCell className="font-medium text-xs">{formatCurrency(Number(d.amount))}</TableCell>
              <TableCell className="text-xs">{d.deduction_date}</TableCell>
              <TableCell className="text-xs">{d.deduction_month || "—"}</TableCell>
            </TableRow>
          ))}
          {deductions.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد مسحوبات</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add Deduction Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة مسحوبات / خصم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>النوع</Label>
              <Select value={form.deduction_type} onValueChange={v => setForm({ ...form, deduction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEDUCTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المبلغ</Label>
              <Input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>الوصف / السبب</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>تاريخ الإضافة</Label>
              <Input type="date" value={form.deduction_date} onChange={e => setForm({ ...form, deduction_date: e.target.value })} />
            </div>
            <div>
              <Label>شهر الاستقطاع</Label>
              <Input type="month" value={form.deduction_month} onChange={e => setForm({ ...form, deduction_month: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleAdd}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Voucher Confirmation */}
      <AlertDialog open={!!deleteVoucherId} onOpenChange={(open) => !open && setDeleteVoucherId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء سند الصرف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء هذا السند؟ سيتم أيضاً إلغاء القيد المحاسبي المرتبط به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVoucher}
              disabled={deletingVoucher}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingVoucher ? "جاري الإلغاء..." : "إلغاء السند"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Advance Request Modal */}
      <AdvanceRequestModal
        open={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        employeeId={employeeId}
        employeeName={employeeName}
        userId={userId}
        onSuccess={() => { fetchAdvances(); onRefresh(); }}
      />
    </div>
  );
}
