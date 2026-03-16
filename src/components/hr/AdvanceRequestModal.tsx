import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/hr-utils";
import { addMonths, format } from "date-fns";
import { ar } from "date-fns/locale";

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  userId: string;
  onSuccess: () => void;
}

export default function AdvanceRequestModal({ open, onClose, employeeId, employeeName, userId, onSuccess }: Props) {
  const [step, setStep] = useState(1);
  const [advanceType, setAdvanceType] = useState<"سلفة_راتب" | "قرض_حسن">("سلفة_راتب");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("نقداً");
  const [installmentsCount, setInstallmentsCount] = useState(3);
  const [startMonth, setStartMonth] = useState(() => {
    const next = addMonths(new Date(), 1);
    return format(next, "yyyy-MM-01");
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const installmentAmount = useMemo(() => {
    if (advanceType === "سلفة_راتب" || installmentsCount <= 0) return amount;
    return Math.ceil((amount / installmentsCount) * 100) / 100;
  }, [amount, installmentsCount, advanceType]);

  const installmentSchedule = useMemo(() => {
    if (advanceType === "سلفة_راتب") return [];
    const schedule: { num: number; month: string; monthLabel: string; amount: number }[] = [];
    const start = new Date(startMonth);
    let remaining = amount;
    for (let i = 0; i < installmentsCount; i++) {
      const m = addMonths(start, i);
      const amt = i === installmentsCount - 1 ? remaining : installmentAmount;
      remaining -= amt;
      schedule.push({
        num: i + 1,
        month: format(m, "yyyy-MM-01"),
        monthLabel: `${monthNames[m.getMonth()]} ${m.getFullYear()}`,
        amount: amt,
      });
    }
    return schedule;
  }, [advanceType, amount, installmentsCount, startMonth, installmentAmount]);

  const endMonth = useMemo(() => {
    if (installmentSchedule.length === 0) return "";
    return installmentSchedule[installmentSchedule.length - 1].monthLabel;
  }, [installmentSchedule]);

  const handleSubmit = async () => {
    if (amount <= 0) { toast.error("المبلغ مطلوب"); return; }
    setSaving(true);
    try {
      const count = advanceType === "سلفة_راتب" ? 1 : installmentsCount;
      const instAmt = advanceType === "سلفة_راتب" ? amount : installmentAmount;
      const startDed = advanceType === "سلفة_راتب"
        ? format(addMonths(new Date(), 1), "yyyy-MM-01")
        : startMonth;

      const { data: advance, error } = await supabase
        .from("employee_advances")
        .insert({
          user_id: userId,
          employee_id: employeeId,
          advance_type: advanceType,
          amount,
          request_date: new Date().toISOString().split("T")[0],
          payment_method: paymentMethod,
          installments_count: count,
          installment_amount: instAmt,
          start_deduction_month: startDed,
          status: "approved",
          approved_date: new Date().toISOString().split("T")[0],
          approved_by: userId,
          notes: [reason, notes].filter(Boolean).join(" | "),
          created_by: userId,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Create installment rows
      const installments = [];
      const start = new Date(startDed);
      let remaining = amount;
      for (let i = 0; i < count; i++) {
        const m = addMonths(start, i);
        const amt = i === count - 1 ? remaining : instAmt;
        remaining -= amt;
        installments.push({
          advance_id: advance.id,
          employee_id: employeeId,
          user_id: userId,
          installment_number: i + 1,
          due_month: format(m, "yyyy-MM-01"),
          amount: amt,
          status: "pending",
        });
      }

      if (installments.length > 0) {
        const { error: instErr } = await supabase
          .from("employee_advance_installments")
          .insert(installments as any);
        if (instErr) throw instErr;
      }

      toast.success("تم تسجيل طلب السلفة بنجاح");
      onSuccess();
      handleClose();
    } catch (err: any) {
      toast.error(err.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setAdvanceType("سلفة_راتب");
    setAmount(0);
    setReason("");
    setPaymentMethod("نقداً");
    setInstallmentsCount(3);
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب سلفة / قرض حسن — {employeeName}</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">اختر نوع الطلب</p>
            <div className="grid grid-cols-2 gap-3">
              <Card
                className={`p-4 cursor-pointer transition-all text-center ${advanceType === "سلفة_راتب" ? "border-primary bg-primary/5 ring-2 ring-primary" : "hover:border-primary/50"}`}
                onClick={() => setAdvanceType("سلفة_راتب")}
              >
                <Banknote className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="font-bold text-sm">💵 سلفة راتب</p>
                <p className="text-[10px] text-muted-foreground mt-1">تُخصم من الراتب القادم بالكامل</p>
              </Card>
              <Card
                className={`p-4 cursor-pointer transition-all text-center ${advanceType === "قرض_حسن" ? "border-primary bg-primary/5 ring-2 ring-primary" : "hover:border-primary/50"}`}
                onClick={() => setAdvanceType("قرض_حسن")}
              >
                <Handshake className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="font-bold text-sm">🤝 قرض حسن</p>
                <p className="text-[10px] text-muted-foreground mt-1">تُقسَّط شهرياً حسب الاتفاق</p>
              </Card>
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>التالي</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>المبلغ المطلوب *</Label>
              <Input type="number" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} placeholder="0.00" />
            </div>

            {advanceType === "قرض_حسن" && (
              <>
                <div className="space-y-2">
                  <Label>عدد الأقساط الشهرية *</Label>
                  <Input type="number" min={1} max={24} value={installmentsCount} onChange={e => setInstallmentsCount(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>شهر بداية الاستقطاع *</Label>
                  <Input type="month" value={startMonth.slice(0, 7)} onChange={e => setStartMonth(e.target.value + "-01")} />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>سبب الطلب</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="اختياري" />
            </div>

            <div className="space-y-2">
              <Label>طريقة الصرف</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="نقداً">نقداً</SelectItem>
                  <SelectItem value="تحويل_بنكي">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* Summary */}
            {amount > 0 && (
              <Card className="p-4 bg-muted/30 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">المبلغ الإجمالي:</span><b>{formatCurrency(amount)}</b></div>
                {advanceType === "قرض_حسن" ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">عدد الأقساط:</span><b>{installmentsCount} أشهر</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">قسط شهري:</span><b>{formatCurrency(installmentAmount)}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">بداية الاستقطاع:</span><b>{monthNames[new Date(startMonth).getMonth()]} {new Date(startMonth).getFullYear()}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">نهاية الاستقطاع:</span><b>{endMonth}</b></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-muted-foreground">الاستقطاع:</span><b>من الراتب القادم بالكامل</b></div>
                )}
              </Card>
            )}

            {/* Installment preview for loan */}
            {advanceType === "قرض_حسن" && installmentSchedule.length > 0 && amount > 0 && (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">القسط</TableHead>
                      <TableHead className="text-right">الشهر</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installmentSchedule.map(inst => (
                      <TableRow key={inst.num}>
                        <TableCell className="text-xs">{inst.num}</TableCell>
                        <TableCell className="text-xs">{inst.monthLabel}</TableCell>
                        <TableCell className="text-xs font-medium">{formatCurrency(inst.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">رجوع</Button>
              <Button onClick={handleSubmit} disabled={saving || amount <= 0} className="flex-1">
                {saving ? "جاري الحفظ..." : "تقديم الطلب"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
