import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateTermination, formatCurrency } from "@/lib/hr-utils";

interface Props {
  open: boolean;
  onClose: () => void;
  employee: { id: string; full_name: string; start_date: string; base_salary: number; annual_leave_balance?: number } | null;
  userId: string;
  onSuccess: () => void;
}

export default function TerminationDialog({ open, onClose, employee, userId, onSuccess }: Props) {
  const [termDate, setTermDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [unpaidAdvances, setUnpaidAdvances] = useState(0);
  const [saving, setSaving] = useState(false);
  const [calculated, setCalculated] = useState<ReturnType<typeof calculateTermination> | null>(null);

  if (!employee) return null;

  const handleCalculate = () => {
    const result = calculateTermination(
      employee.start_date,
      termDate,
      Number(employee.base_salary),
      Number((employee as any).annual_leave_balance) || 0,
      unpaidAdvances
    );
    setCalculated(result);
  };

  const handleSave = async () => {
    if (!calculated) return;
    setSaving(true);

    // Create termination record
    const { error: termError } = await supabase.from("termination_records").insert({
      user_id: userId,
      employee_id: employee.id,
      termination_date: termDate,
      termination_reason: reason,
      years_worked: calculated.yearsWorked,
      severance_pay: calculated.severancePay,
      unused_leave_pay: calculated.unusedLeavePay,
      current_month_salary: calculated.currentMonthSalary,
      advance_balance: calculated.advanceBalance,
      total_dues: calculated.totalDues,
    } as any);

    if (termError) {
      toast.error(termError.message);
      setSaving(false);
      return;
    }

    // Mark employee as terminated
    await supabase.from("employees").update({
      is_active: false,
      is_terminated: true,
      terminated_at: termDate,
      termination_reason: reason,
    } as any).eq("id", employee.id);

    toast.success("تم إنهاء خدمة الموظف وحساب المستحقات");
    setSaving(false);
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            إنهاء خدمة: {employee.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">تاريخ الإنهاء</label>
            <Input type="date" value={termDate} onChange={e => { setTermDate(e.target.value); setCalculated(null); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">السبب</label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب إنهاء الخدمة..." rows={2} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">سلف غير مسددة (₪)</label>
            <Input type="number" value={unpaidAdvances} onChange={e => { setUnpaidAdvances(Number(e.target.value)); setCalculated(null); }} />
          </div>

          <Button variant="outline" onClick={handleCalculate} className="w-full gap-2">
            <Calculator className="h-4 w-4" /> حساب المستحقات
          </Button>

          {calculated && (
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">سنوات الخدمة</span><span className="font-bold">{calculated.yearsWorked.toFixed(1)} سنة</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مكافأة نهاية الخدمة</span><span className="font-bold text-emerald-600">{formatCurrency(calculated.severancePay)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إجازات مستحقة</span><span className="font-bold">{formatCurrency(calculated.unusedLeavePay)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">راتب الشهر الحالي</span><span className="font-bold">{formatCurrency(calculated.currentMonthSalary)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">سلف مستحقة</span><span className="font-bold text-red-500">- {formatCurrency(calculated.advanceBalance)}</span></div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-bold">إجمالي المستحقات</span>
                <span className="font-bold text-primary text-lg">{formatCurrency(calculated.totalDues)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="destructive" onClick={handleSave} disabled={!calculated || saving}>
            {saving ? "جاري الحفظ..." : "تأكيد إنهاء الخدمة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
